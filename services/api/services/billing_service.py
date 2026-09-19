from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from app.models.models import (
    Plan, Subscription, UsageRecord, Invoice, Organization, PayPalWebhookEvent
)
from services.billing.paypal_service import paypal_client
from uuid import UUID
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from decimal import Decimal
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class BillingService:
    """Production-grade billing service refined for PayPal-only migration"""
    
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_plans(self) -> List[Plan]:
        """Get all active billing plans"""
        try:
            result = await self.db.execute(
                select(Plan).where(Plan.is_active == True).order_by(Plan.price_monthly)
            )
            plans = result.scalars().all()
            return plans
        except Exception as e:
            logger.error(f"Error fetching plans: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to fetch billing plans")

    async def get_org_subscription(self, org_id: UUID) -> Optional[Subscription]:
        """Get current subscription for organization"""
        try:
            result = await self.db.execute(
                select(Subscription)
                .where(Subscription.org_id == org_id)
                .order_by(Subscription.created_at.desc())
                .limit(1)
            )
            return result.scalars().first()
        except Exception as e:
            logger.error(f"Error fetching subscription: {str(e)}")
            return None

    async def get_org_invoices(self, org_id: UUID, limit: int = 50) -> List[Invoice]:
        """Get organization's invoices"""
        try:
            result = await self.db.execute(
                select(Invoice)
                .where(Invoice.org_id == org_id)
                .order_by(Invoice.created_at.desc())
                .limit(limit)
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching invoices: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to fetch invoices")

    async def create_usage_record(
        self, org_id: UUID, room_id: Optional[UUID], minutes: float
    ) -> UsageRecord:
        """Create usage record for billing"""
        try:
            sub = await self.get_org_subscription(org_id)
            plan = None
            if sub:
                plan_result = await self.db.execute(select(Plan).where(Plan.id == sub.plan_id))
                plan = plan_result.scalars().first()
            
            period_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            usage_result = await self.db.execute(
                select(UsageRecord).where(and_(UsageRecord.org_id == org_id, UsageRecord.recorded_at >= period_start))
            )
            total_used = sum(u.minutes_used for u in usage_result.scalars().all()) or Decimal("0")
            
            is_overage = False
            minutes_dec = Decimal(str(minutes))
            if plan and (total_used + minutes_dec) > plan.minutes_included:
                is_overage = True
            
            record = UsageRecord(org_id=org_id, room_id=room_id, minutes_used=minutes_dec, is_overage=is_overage)
            self.db.add(record)
            await self.db.flush()
            return record
        except Exception as e:
            logger.error(f"Error creating usage record: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to record usage")

    async def create_checkout_session(
        self, org_id: UUID, plan_id: UUID, redirect_url: str, user
    ) -> str:
        """Create PayPal checkout session for subscription (Stripe removed)"""
        try:
            plan_result = await self.db.execute(select(Plan).where(and_(Plan.id == plan_id, Plan.is_active == True)))
            plan = plan_result.scalars().first()
            if not plan:
                raise HTTPException(status_code=404, detail="Plan not found")
            
            # --- AUTO-SYNC GUARD: Instead of hard failing, try to sync on demand ---
            if not plan.paypal_plan_id or plan.paypal_plan_id in ("", "None"):
                logger.warning(
                    f"Plan '{plan.name}' missing PayPal ID at checkout — attempting auto-sync..."
                )
                try:
                    paypal_plan_id = await paypal_client.create_or_sync_paypal_plan(plan)
                    plan.paypal_plan_id = paypal_plan_id
                    await self.db.commit()
                    logger.info(
                        f"Auto-sync succeeded for plan '{plan.name}' → {paypal_plan_id}"
                    )
                except Exception as e:
                    logger.error(f"Auto-sync failed for plan '{plan.name}': {e}")
                    raise HTTPException(
                        status_code=500,
                        detail=(
                            f"Could not configure PayPal for plan '{plan.name}'. "
                            f"Please try again in a moment."
                        )
                    )

            # 3. [STRICT PRODUCTION VALIDATION] Verify plan is ACTIVE in PayPal
            logger.info(f"[PAYPAL] Creating subscription for org {org_id}")
            logger.info(f"[PAYPAL] Using Plan ID: {plan.paypal_plan_id}")
            
            is_valid = await paypal_client.validate_plan(plan.paypal_plan_id)
            if not is_valid:
                # --- EMERGENCY RE-SYNC: If plan is INACTIVE in PayPal, try a fresh sync ---
                logger.warning(
                    f"Plan '{plan.name}' is INACTIVE on PayPal (ID: {plan.paypal_plan_id}) — "
                    "attempting emergency re-sync..."
                )
                try:
                    new_paypal_plan_id = await paypal_client.create_or_sync_paypal_plan(plan)
                    plan.paypal_plan_id = new_paypal_plan_id
                    await self.db.commit()
                    logger.info(
                        f"Emergency re-sync succeeded for plan '{plan.name}' → {new_paypal_plan_id}"
                    )
                    # Use the new ID for the rest of the flow
                    is_valid = True
                except Exception as e:
                    logger.error(f"Emergency re-sync failed for plan '{plan.name}': {e}")
                    # is_valid remains False, will throw 400 below

            if not is_valid:
                logger.error(f"[PAYPAL][ERROR] Plan {plan.paypal_plan_id} is not ACTIVE or does not exist in {settings.PAYPAL_ENV}")
                raise HTTPException(
                    status_code=400, 
                    detail=f"This billing plan is currently unavailable (Status: INACTIVE in {settings.PAYPAL_ENV})"
                )

            logger.info(f"[PAYPAL] Plan validated: ACTIVE")
            
            # 4. [LINKING] Since custom_id is removed from payload to avoid 400 errors, 
            # we must ensure org_id is in the return_url for reconstruction.
            sep = "&" if "?" in redirect_url else "?"
            final_return_url = f"{redirect_url}{sep}org_id={org_id}"
            
            paypal_sub = await paypal_client.create_subscription(
                plan_id=plan.paypal_plan_id,
                org_id=str(org_id),
                return_url=final_return_url,
                cancel_url=redirect_url
            )
            return paypal_sub["approval_url"]
        except HTTPException:
            # Re-raise explicit HTTP exceptions (like 404 Plan Not Found)
            raise
        except Exception as e:
            logger.error(f"Error creating PayPal checkout: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to create checkout session")

    async def verify_paypal_subscription(self, subscription_id: str, org_id: Optional[UUID] = None) -> bool:
        """Manually verify a PayPal subscription and update database."""
        try:
            details = await paypal_client.get_subscription_details(subscription_id)
            status = details.get("status")
            if status not in ["ACTIVE", "APPROVED"]:
                logger.warning(f"[BILLING] Subscription {subscription_id} not active: {status}")
                return False

            # If custom_id is missing (removed from creation payload), use the passed org_id
            org_id_str = details.get("custom_id")
            if not org_id_str and not org_id:
                logger.error(f"[BILLING] No org_id provided and custom_id missing for subscription {subscription_id}")
                return False
            
            target_org_id = org_id if org_id else UUID(org_id_str)
            plan_id_paypal = details.get("plan_id")
            
            plan_result = await self.db.execute(select(Plan).where(Plan.paypal_plan_id == plan_id_paypal))
            plan = plan_result.scalars().first()
            if not plan:
                logger.error(f"[BILLING] Plan {plan_id_paypal} not found for subscription {subscription_id}")
                return False

            sub_result = await self.db.execute(
                select(Subscription)
                .where(Subscription.org_id == target_org_id)
                .order_by(Subscription.created_at.desc())
                .limit(1)
            )
            sub = sub_result.scalars().first()
            
            now = datetime.utcnow()
            # 🗓️ Calculate period end based on plan name (Monthly vs Annual)
            period_days = 365 if "annu" in plan.name.lower() else 30
            period_end = now + timedelta(days=period_days)

            if sub:
                sub.plan_id = plan.id
                sub.paypal_subscription_id = subscription_id
                sub.billing_provider = "paypal"
                sub.status = "active"
                sub.updated_at = now
                sub.current_period_start = now
                sub.current_period_end = period_end
            else:
                sub = Subscription(
                    org_id=target_org_id, plan_id=plan.id, paypal_subscription_id=subscription_id,
                    billing_provider="paypal", status="active",
                    current_period_start=now, current_period_end=period_end
                )
                self.db.add(sub)
            await self.db.flush()

            # Create invoice for this payment if not already recorded
            existing_inv = await self.db.execute(
                select(Invoice).where(Invoice.paypal_invoice_id == subscription_id)
            )
            if not existing_inv.scalars().first():
                amount = float(plan.price_monthly) if plan and plan.price_monthly else 0.0
                invoice = Invoice(
                    org_id=target_org_id,
                    subscription_id=sub.id,
                    paypal_invoice_id=subscription_id,
                    amount=amount,
                    currency="USD",
                    status="paid",
                    billing_period_start=now,
                    billing_period_end=period_end,
                    paid_at=now,
                )
                self.db.add(invoice)
                logger.info(f"[BILLING] Invoice created on verify: {subscription_id} ${amount}")

            return True
        except Exception as e:
            logger.error(f"Error verifying PayPal session {subscription_id}: {str(e)}")
            return False

    async def check_limits_before_activation(self, org_id: UUID) -> tuple[bool, Optional[str]]:
        """Check if organization can activate AI (Grace period logic removed for simplicity in Stripe-free mode)"""
        try:
            sub = await self.get_org_subscription(org_id)
            if not sub: return True, None
            if sub.status not in ["active", "trialing"]:
                return False, f"Subscription is {sub.status}. Please upgrade."
            
            plan_result = await self.db.execute(select(Plan).where(Plan.id == sub.plan_id))
            plan = plan_result.scalars().first()
            if not plan: return False, "Plan configuration error"
            
            period_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            usage_result = await self.db.execute(
                select(UsageRecord).where(and_(UsageRecord.org_id == org_id, UsageRecord.recorded_at >= period_start))
            )
            total_used = sum(u.minutes_used for u in usage_result.scalars().all()) or 0
            if total_used >= plan.minutes_included and not sub.overage_allowed:
                return False, "Usage limit exceeded."
            return True, None
        except Exception:
            logger.exception("Unexpected error in check_limits_before_activation")
            return False, "Failed to check subscription limits"

    async def sync_plans_to_paypal(self):
        """
        Production sync routine to ensure all local plans have valid PayPal IDs.
        Called on FastAPI startup.
        """
        from sqlalchemy import or_
        
        logger.info("=== PAYPAL SYNC: Starting ===")
        try:
            # Query plans missing a paypal_plan_id (including literal string "None")
            result = await self.db.execute(
                select(Plan).where(
                    or_(
                        Plan.paypal_plan_id == None, 
                        Plan.paypal_plan_id == "",
                        Plan.paypal_plan_id == "None"
                    )
                )
            )
            missing_plans = result.scalars().all()
            
            if not missing_plans:
                logger.info("=== PAYPAL SYNC: All plans already synced. Nothing to do. ===")
                return

            logger.info(f"=== PAYPAL SYNC: {len(missing_plans)} plans need syncing ===")
            
            synced_count = 0
            for plan in missing_plans:
                try:
                    logger.info(f"=== PAYPAL SYNC: Syncing plan '{plan.name}' ===")
                    paypal_id = await paypal_client.create_or_sync_paypal_plan(plan)
                    
                    plan.paypal_plan_id = paypal_id
                    logger.info(f"=== PAYPAL SYNC: Plan '{plan.name}' synced → paypal_plan_id={paypal_id} ===")
                    synced_count += 1
                except Exception as e:
                    logger.error(f"=== PAYPAL SYNC: FAILED for plan '{plan.name}': {e} ===", exc_info=True)
                    # Continue with other plans
            
            if synced_count > 0:
                await self.db.commit()
                logger.info(f"=== PAYPAL SYNC: Complete. {synced_count} plans updated. ===")
            else:
                logger.info("=== PAYPAL SYNC: Finished with no updates. ===")
                
        except Exception as e:
            logger.error(f"=== PAYPAL SYNC: [CRITICAL] Error: {str(e)} ===", exc_info=True)