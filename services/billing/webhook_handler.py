import logging
from typing import Dict, Any, Optional
from .paypal_service import paypal_client
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import PayPalWebhookEvent, Subscription, Invoice, Plan, Organization
import json
import datetime

logger = logging.getLogger(__name__)

class WebhookHandler:
    """
    Handles incoming PayPal webhooks.
    """
    
    async def process_event(self, headers: Dict[str, str], body: bytes, db: AsyncSession) -> Dict[str, Any]:
        """
        Main entry point for webhook processing. Verifies signature, checks idempotency, and routes events.
        """
        # Step 1: Verify authenticity
        is_valid = await paypal_client.verify_webhook_signature(headers, body)
        if not is_valid:
            logger.warning("[WEBHOOK] Invalid signature from PayPal.")
            return {"status": "error", "reason": "invalid_signature"}
            
        try:
            event = json.loads(body.decode())
            event_id = event.get("id")
            event_type = event.get("event_type")
            resource = event.get("resource", {})
            
            if not event_id:
                return {"status": "error", "reason": "missing_event_id"}

            # Step 2: Idempotency Check
            existing_event = await db.execute(
                select(PayPalWebhookEvent).where(PayPalWebhookEvent.paypal_event_id == event_id)
            )
            if existing_event.scalars().first():
                logger.info(f"[WEBHOOK] Event {event_id} already processed. Skipping.")
                return {"status": "skipped", "reason": "already_processed", "id": event_id}

            # Step 3: Record Event
            db_event = PayPalWebhookEvent(
                paypal_event_id=event_id,
                event_type=event_type,
                payload=event,
                processed=False
            )
            db.add(db_event)
            await db.flush()

            logger.info(f"[WEBHOOK] Processing PayPal event '{event_type}' (ID: {event_id})")
            
            result = {"status": "ignored", "reason": "unhandled_event_type"}
            
            if event_type == "BILLING.SUBSCRIPTION.CREATED":
                result = await self.handle_subscription_created(resource)
            elif event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
                result = await self.handle_subscription_activated(resource, db)
            elif event_type == "BILLING.SUBSCRIPTION.CANCELLED":
                result = await self.handle_subscription_cancelled(resource, db)
            elif event_type == "PAYMENT.SALE.COMPLETED":
                result = await self.handle_payment_completed(resource, db)
            
            # Step 4: Mark as processed
            db_event.processed = (result.get("status") in ["active", "cancelled", "payment_completed", "created"])
            db_event.processed_at = datetime.datetime.utcnow()
            
            return result
                
        except Exception:
            logger.exception("[WEBHOOK] Critical error processing event")
            return {"status": "error", "reason": "internal_error"}

    async def handle_subscription_created(self, resource: Dict[str, Any]):
        """
        Logs initial subscription creation.
        """
        logger.info(f"[WEBHOOK] Subscription {resource.get('id')} created.")
        return {"status": "created", "id": resource.get("id")}

    async def handle_subscription_activated(self, resource: Dict[str, Any], db: AsyncSession):
        """Updates subscription status to active in DB."""
        subscription_id = resource.get("id")
        plan_id_paypal = resource.get("plan_id")
        logger.info(f"[WEBHOOK] Subscription {subscription_id} activated")

        try:
            plan_result = await db.execute(select(Plan).where(Plan.paypal_plan_id == plan_id_paypal))
            plan = plan_result.scalars().first()

            sub_result = await db.execute(
                select(Subscription).where(Subscription.paypal_subscription_id == subscription_id)
            )
            sub = sub_result.scalars().first()

            if sub:
                sub.status = "active"
                sub.updated_at = datetime.datetime.utcnow()
                if plan:
                    sub.plan_id = plan.id
                now = datetime.datetime.utcnow()
                if not sub.current_period_start:
                    sub.current_period_start = now
                if not sub.current_period_end:
                    sub.current_period_end = now + datetime.timedelta(days=30)
        except Exception as e:
            logger.error(f"[WEBHOOK] Error updating subscription {subscription_id}: {e}")

        return {"status": "active", "id": subscription_id}

    async def handle_subscription_cancelled(self, resource: Dict[str, Any], db: AsyncSession):
        """Updates subscription status to cancelled in DB."""
        subscription_id = resource.get("id")
        logger.info(f"[WEBHOOK] Subscription {subscription_id} cancelled")

        try:
            sub_result = await db.execute(
                select(Subscription).where(Subscription.paypal_subscription_id == subscription_id)
            )
            sub = sub_result.scalars().first()
            if sub:
                sub.status = "canceled"
                sub.updated_at = datetime.datetime.utcnow()
        except Exception as e:
            logger.error(f"[WEBHOOK] Error cancelling subscription {subscription_id}: {e}")

        return {"status": "cancelled", "id": subscription_id}

    async def handle_payment_completed(self, resource: Dict[str, Any], db: AsyncSession):
        """Records payment as Invoice in DB."""
        sale_id = resource.get("id")
        subscription_id = resource.get("billing_agreement_id")
        amount = float(resource.get("amount", {}).get("total", 0))
        currency = resource.get("amount", {}).get("currency", "USD")
        logger.info(f"[WEBHOOK] Payment {sale_id} completed (${amount})")

        if not subscription_id:
            return {"status": "payment_completed", "sale_id": sale_id}

        try:
            sub_result = await db.execute(
                select(Subscription).where(Subscription.paypal_subscription_id == subscription_id)
            )
            sub = sub_result.scalars().first()
            if not sub:
                logger.warning(f"[WEBHOOK] No subscription found for PayPal ID {subscription_id}")
                return {"status": "payment_completed", "sale_id": sale_id}

            # Advance billing period on successful payment
            now = datetime.datetime.utcnow()
            period_start = sub.current_period_end or now
            period_end = period_start + datetime.timedelta(days=30)
            sub.current_period_start = period_start
            sub.current_period_end = period_end
            sub.status = "active"

            # Create invoice record (idempotent: skip if paypal_invoice_id already exists)
            existing = await db.execute(
                select(Invoice).where(Invoice.paypal_invoice_id == sale_id)
            )
            if not existing.scalars().first():
                invoice = Invoice(
                    org_id=sub.org_id,
                    subscription_id=sub.id,
                    paypal_invoice_id=sale_id,
                    amount=amount,
                    currency=currency,
                    status="paid",
                    billing_period_start=period_start,
                    billing_period_end=period_end,
                    paid_at=now,
                )
                db.add(invoice)
                logger.info(f"[WEBHOOK] Invoice created: {sale_id} ${amount} for org {sub.org_id}")
        except Exception as e:
            logger.error(f"[WEBHOOK] Error recording payment {sale_id}: {e}")

        return {"status": "payment_completed", "sale_id": sale_id}

# Singleton instance
webhook_handler = WebhookHandler()
