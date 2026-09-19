from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
from app.core.database import get_db
from app.models.models import (
    User, OrgMember, Plan, Subscription, UsageRecord, Invoice, Room, Organization
)
from app.schemas.billing import (
    PlanResponse, SubscriptionResponse, InvoiceResponse, CheckoutRequest, 
    UsageResponse, OverageResponse, UsageCreate
)
from app.api.deps import get_current_user
from app.core.config import settings
from app.services.billing_service import BillingService
from services.billing.paypal_service import paypal_client
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


def _verify_org_access(member):
    """Verify user is org member"""
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")


async def _get_user_org_membership(db: AsyncSession, org_id: UUID, user_id: UUID):
    """Get user's membership in organization"""
    result = await db.execute(
        select(OrgMember).where(
            and_(
                OrgMember.org_id == org_id,
                OrgMember.user_id == user_id
            )
        )
    )
    return result.scalars().first()


# ==================== PLANS ====================

@router.get(
    "/plans", 
    response_model=List[PlanResponse],
    summary="List Billing Plans",
    responses={
        200: {"description": "Plans retrieved successfully"}
    }
)
async def list_plans(db: AsyncSession = Depends(get_db)):
    r"""
    Get all active billing plans available.
    
    **React Integration Example:**
    
    ```javascript
    // hooks/useBilling.js
    import { useState, useEffect } from 'react';
    
    export function usePlans() {
      const [plans, setPlans] = useState([]);
      const [loading, setLoading] = useState(true);
      
      useEffect(() => {
        const fetchPlans = async () => {
          try {
            const response = await fetch('/api/v1/billing/plans');
            if (!response.ok) throw new Error('Failed to fetch plans');
            const data = await response.json();
            setPlans(data);
          } catch (error) {
            console.error('Error fetching plans:', error);
          } finally {
            setLoading(false);
          }
        };
        
        fetchPlans();
      }, []);
      
      return { plans, loading };
    }
    
    // PricingPage.jsx
    import { usePlans } from '../hooks/useBilling';
    
    export function PricingPage() {
      const { plans, loading } = usePlans();
      
      if (loading) return <div>Loading plans...</div>;
      
      return (
        <div className="pricing-grid">
          {plans.map((plan) => (
            <div key={plan.id} className="plan-card">
              <h3>{plan.name}</h3>
              <p className="price">\${plan.price_monthly}/month</p>
              <p className="description">{plan.description}</p>
              <ul>
                <li>{plan.minutes_included} minutes/month</li>
                <li>Max {plan.max_rooms} rooms</li>
                <li>Max {plan.max_participants} participants</li>
              </ul>
              <button onClick={() => handleUpgrade(plan.id)}>Choose Plan</button>
            </div>
          ))}
        </div>
      );
    }
    ```
    """
    try:
        service = BillingService(db)
        plans = await service.get_plans()
        return [PlanResponse.model_validate(p) for p in plans]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing plans: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch billing plans")


# ==================== SUBSCRIPTIONS ====================

@router.get(
    "/organization/{org_id}/subscription",
    response_model=SubscriptionResponse,
    summary="Get Organization Subscription",
    responses={
        200: {"description": "Subscription details"},
        403: {"description": "Access denied"},
        401: {"description": "Unauthorized"}
    }
)
async def get_subscription(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the current subscription status for an organization.
    
    **React Integration Example:**
    
    ```javascript
    // hooks/useSubscription.js
    import { useState, useEffect } from 'react';
    
    export function useSubscription(orgId, token) {
      const [subscription, setSubscription] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      
      useEffect(() => {
        const fetchSubscription = async () => {
          try {
            const response = await fetch(
              `/api/v1/billing/organization/${orgId}/subscription`,
              {
                headers: { 'Authorization': `Bearer ${token}` }
              }
            );
            
            if (!response.ok) throw new Error('Failed to fetch subscription');
            const data = await response.json();
            setSubscription(data);
          } catch (err) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        };
        
        fetchSubscription();
        // Poll every 5 seconds for real-time updates
        const interval = setInterval(fetchSubscription, 5000);
        return () => clearInterval(interval);
      }, [orgId, token]);
      
      return { subscription, loading, error };
    }
    
    // BillingStatus.jsx
    import { useSubscription } from '../hooks/useSubscription';
    
    export function BillingStatus({ orgId, token }) {
      const { subscription, loading, error } = useSubscription(orgId, token);
      
      if (loading) return <div>Loading subscription...</div>;
      if (error) return <div className="error">{error}</div>;
      if (!subscription) return <div>No subscription</div>;
      
      const minutesRemaining = subscription.minutes_total - subscription.minutes_used;
      const usagePercent = (subscription.minutes_used / subscription.minutes_total) * 100;
      
      return (
        <div className="subscription-card">
          <h3>Current Plan: {subscription.plan}</h3>
          <p>Status: <span className={subscription.status}>{subscription.status}</span></p>
          
          <div className="usage-bar">
            <div 
              className="usage-fill"
              style={{width: `${usagePercent}%`}}
            />
          </div>
          
          <p>{subscription.minutes_used} / {subscription.minutes_total} minutes used</p>
          <p>{minutesRemaining} minutes remaining</p>
          
          {subscription.status === 'grace_period' && (
            <div className="warning">
              Payment failed. Please update your payment method.
            </div>
          )}
          
          {minutesRemaining <= 60 && (
            <button onClick={() => window.location.href = '/billing/upgrade'}>
              Upgrade Plan
            </button>
          )}
        </div>
      );
    }
    ```
    """
    try:
        member = await _get_user_org_membership(db, org_id, current_user.id)
        _verify_org_access(member)
        
        service = BillingService(db)
        sub = await service.get_org_subscription(org_id)
        
        if not sub:
            # Free tier — compute real days remaining from org creation date
            now = datetime.now(timezone.utc)
            org_result = await db.execute(select(Organization).where(Organization.id == org_id))
            org = org_result.scalars().first()
            if org and org.created_at:
                org_created = org.created_at
                if org_created.tzinfo is None:
                    org_created = org_created.replace(tzinfo=timezone.utc)
                free_period_end = org_created + timedelta(days=30)
                days_remaining = max(0, (free_period_end - now).days)
            else:
                free_period_end = now + timedelta(days=30)
                days_remaining = 30
            # Show upgrade banner throughout the entire 30-day free period
            is_expiring_soon = days_remaining <= 30
            return SubscriptionResponse(
                org_id=org_id,
                status="active",
                plan_name="Free",
                current_period_start=org.created_at if org else now,
                current_period_end=free_period_end,
                cancel_at_period_end=False,
                minutes_used=0.0,
                minutes_total=60,
                overage_allowed=False,
                days_remaining=days_remaining,
                is_expiring_soon=is_expiring_soon,
            )
        
        # Get plan info
        plan_result = await db.execute(
          select(Plan).where(Plan.id == sub.plan_id)
        )
        plan = plan_result.scalars().first()

        # Guard against legacy subscriptions missing or anomalous period dates
        now_utc = datetime.now(timezone.utc)
        needs_save = False
        if not sub.current_period_start or not sub.current_period_end:
            if not sub.current_period_start:
                sub.current_period_start = now_utc
            if not sub.current_period_end:
                sub.current_period_end = sub.current_period_start + timedelta(days=30)
            needs_save = True
        else:
            # Sanity-check: if period end is more than 400 days away, the DB record
            # has a corrupt/placeholder date (e.g. 2036). Auto-heal to 30 days from start.
            end_check = sub.current_period_end
            if end_check.tzinfo is None:
                end_check = end_check.replace(tzinfo=timezone.utc)
            if (end_check - now_utc).days > 400:
                start = sub.current_period_start
                if start.tzinfo is None:
                    start = start.replace(tzinfo=timezone.utc)
                healed = start + timedelta(days=30)
                # Store without tzinfo to match DB column type
                sub.current_period_end = healed.replace(tzinfo=None)
                needs_save = True
                logger.warning(
                    f"Auto-healed anomalous period_end for subscription {sub.id}: "
                    f"was {end_check.date()}, now {healed.date()}"
                )
        if needs_save:
            await db.commit()

        # Get usage this month
        period_start = now_utc.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        usage_result = await db.execute(
            select(func.sum(UsageRecord.minutes_used)).where(
                and_(
                    UsageRecord.org_id == org_id,
                    UsageRecord.recorded_at >= period_start
                )
            )
        )
        total_used = usage_result.scalar() or 0.0

        end = sub.current_period_end
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        days_remaining = max(0, (end - now_utc).days)
        is_expiring_soon = days_remaining <= 7 and sub.status == "active"

        return SubscriptionResponse(
            id=sub.id,
            org_id=sub.org_id,
            plan_name=plan.name if plan else "Free",
            status=sub.status,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
            cancel_at_period_end=sub.cancel_at_period_end,
            minutes_used=float(total_used),
            minutes_total=plan.minutes_included if plan else 60,
            overage_allowed=sub.overage_allowed,
            days_remaining=days_remaining,
            is_expiring_soon=is_expiring_soon,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching subscription: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch subscription")



# ==================== CHECKOUT ====================

@router.post(
    "/organization/{org_id}/checkout-session",
    summary="Create PayPal Checkout Session",
    responses={
        200: {"description": "Checkout URL created"},
        403: {"description": "Admin only"},
        404: {"description": "Plan not found"}
    }
)
async def create_checkout_session(
    org_id: UUID,
    request: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    [PAYPAL ONLY] Initiate a PayPal subscription checkout.
    """
    try:
        # Verify user is org admin/owner
        member = await _get_user_org_membership(db, org_id, current_user.id)
        if not member or member.role not in ["owner", "admin"]:
            raise HTTPException(
                status_code=403,
                detail="Only organization admins can manage billing"
            )
        
        # Validate plan exists (accept UUID or plan name)
        plan = None
        plan_id = None
        try:
          plan_id = UUID(str(request.plan_id))
        except Exception:
          plan_id = None

        if plan_id:
          plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
          plan = plan_result.scalars().first()
        else:
          plan_name = str(request.plan_id).strip().lower()
          if plan_name:
            plan_result = await db.execute(
              select(Plan).where(func.lower(Plan.name) == plan_name)
            )
            plan = plan_result.scalars().first()

        if not plan:
          raise HTTPException(status_code=404, detail="Plan not found")
        
        service = BillingService(db)
        redirect_url = request.redirect_url or f"{settings.FRONTEND_URL}/billing"

        checkout_url = await service.create_checkout_session(
          org_id,
          plan.id,
          redirect_url,
          current_user
        )
        
        # Validate discount code if provided (already consumed at apply step)
        if request.discount_code:
          from app.models.models import DiscountCode
          dc_result = await db.execute(
            select(DiscountCode).where(
              DiscountCode.code == request.discount_code.strip().upper()
            )
          )
          dc = dc_result.scalars().first()
          if not dc:
            raise HTTPException(status_code=400, detail="Invalid discount code")
          if dc.is_used and dc.used_by_user_id != current_user.id:
            raise HTTPException(status_code=400, detail="This discount code has already been redeemed")
          now = datetime.now(timezone.utc)
          if dc.expires_at and dc.expires_at < now:
            raise HTTPException(status_code=400, detail="This discount code has expired")
        
        await db.commit()
        return {"checkout_url": checkout_url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating checkout: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create checkout session")



@router.post(
    "/verify-session",
    summary="Verify Billing Session",
    responses={
        200: {"description": "Session verified"},
        400: {"description": "Invalid session"}
    }
)
async def verify_session(
    session_id: Optional[str] = None,
    subscription_id: Optional[str] = None,
    org_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually verify a PayPal subscription.
    Used by frontend after redirect to ensure immediate sync.
    """
    try:
        service = BillingService(db)
        success = False
        
        if subscription_id:
            success = await service.verify_paypal_subscription(subscription_id, org_id)
        else:
            raise HTTPException(status_code=400, detail="Missing subscription_id")

        if success:
            await db.commit()
            return {"status": "success", "message": "Subscription updated"}
        else:
            return {"status": "pending", "message": "Payment not yet confirmed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in verify_session endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify session")


# [STRIPE PORTAL REMOVED — PayPal manages subscriptions directly]



# ==================== INVOICES ====================

@router.get(
    "/organization/{org_id}/invoices", 
    response_model=List[InvoiceResponse],
    summary="List Organization Invoices",
    responses={
        200: {"description": "Invoices retrieved successfully"}
    }
)
async def list_invoices(
    org_id: UUID,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    r"""
    Get organization's invoices with pagination.
    
    **React Integration Example (Invoice List with Download):**
    
    ```javascript
    // hooks/useInvoices.js
    import { useState, useEffect } from 'react';
    
    export function useInvoices(orgId, token, limit = 50) {
      const [invoices, setInvoices] = useState([]);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      
      const fetchInvoices = async () => {
        setLoading(true);
        setError(null);
        
        try {
          const response = await fetch(
            `/api/v1/billing/organization/${orgId}/invoices?limit=${limit}`,
            {
              headers: { 'Authorization': `Bearer ${token}` }
            }
          );
          
          if (!response.ok) throw new Error('Failed to fetch invoices');
          
          const data = await response.json();
          setInvoices(data);
        } catch (err) {
          setError(err.message);
          console.error('Invoice fetch error:', err);
        } finally {
          setLoading(false);
        }
      };
      
      useEffect(() => {
        fetchInvoices();
      }, [orgId, token, limit]);
      
      const downloadInvoice = (invoiceUrl) => {
        window.open(invoiceUrl, '_blank');
      };
      
      return { invoices, loading, error, refetch: fetchInvoices, downloadInvoice };
    }
    
    // InvoicesList.jsx
    import { useInvoices } from '../hooks/useInvoices';
    import { useAppStore } from '../store/useAppStore';
    
    export function InvoicesList({ orgId }) {
      const { token } = useAppStore();
      const { invoices, loading, error, downloadInvoice } = useInvoices(orgId, token);
      
      if (loading) return <div>Loading invoices...</div>;
      if (error) return <div className="error">{error}</div>;
      if (!invoices.length) return <div>No invoices found</div>;
      
      return (
        <div className="invoices-container">
          <h3>Billing Invoices</h3>
          <table className="invoices-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.invoice_number}</td>
                  <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                  <td>\${inv.total.toFixed(2)}</td>
                  <td>
                    <span className={`status-badge status-${inv.status}`}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {inv.invoice_pdf_url && (
                      <button 
                        onClick={() => downloadInvoice(inv.invoice_pdf_url)}
                        className="btn-link"
                      >
                        Download PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    ```
    """
    try:
        member = await _get_user_org_membership(db, org_id, current_user.id)
        _verify_org_access(member)
        
        service = BillingService(db)
        invoices = await service.get_org_invoices(org_id, limit)
        
        enriched_invoices = []
        for inv in invoices:
            # Add fields expected by frontend
            inv.period_start = inv.billing_period_start
            inv.period_end = inv.billing_period_end
            inv.total_amount = inv.amount
            
            # Fetch plan name
            plan_name = "Pro"
            try:
                # Get the subscription associated with this invoice
                sub_result = await db.execute(
                    select(Subscription).where(Subscription.id == inv.subscription_id)
                )
                sub = sub_result.scalars().first()
                if sub:
                    plan_result = await db.execute(
                        select(Plan).where(Plan.id == sub.plan_id)
                    )
                    plan = plan_result.scalars().first()
                    if plan:
                        plan_name = plan.name
            except Exception as e:
                logger.error(f"Error fetching plan name for invoice {inv.id}: {e}")
            
            inv.plan_name = plan_name
            
            # Calculate minutes used in this billing period
            minutes_used = 0.0
            try:
                usage_result = await db.execute(
                    select(func.sum(UsageRecord.minutes_used)).where(
                        and_(
                            UsageRecord.org_id == org_id,
                            UsageRecord.recorded_at >= inv.billing_period_start,
                            UsageRecord.recorded_at <= inv.billing_period_end
                        )
                    )
                )
                minutes_used = usage_result.scalar() or 0.0
            except Exception as e:
                logger.error(f"Error fetching usage for invoice {inv.id}: {e}")
            
            inv.minutes_used = float(minutes_used)
            enriched_invoices.append(InvoiceResponse.model_validate(inv))
            
        return enriched_invoices
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing invoices: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch invoices")


@router.post(
    "/admin/sync-paypal-plans",
    include_in_schema=False,
    summary="Force sync all plans to PayPal"
)
async def force_sync_paypal_plans(
    db: AsyncSession = Depends(get_db)
):
    """
    Manual fallback endpoint to trigger PayPal plan synchronization.
    Used if startup sync fails or for immediate patching.
    """
    from sqlalchemy import or_
    from app.models.models import Plan
    
    result = await db.execute(
        select(Plan).where(
            or_(
                Plan.paypal_plan_id == None,
                Plan.paypal_plan_id == "",
                Plan.paypal_plan_id == "None"
            )
        )
    )
    plans = result.scalars().all()

    if not plans:
        return {"message": "All plans already synced", "results": []}

    results = []
    for plan in plans:
        try:
            paypal_plan_id = await paypal_client.create_or_sync_paypal_plan(plan)
            plan.paypal_plan_id = paypal_plan_id
            results.append({
                "plan": plan.name,
                "status": "synced",
                "paypal_plan_id": paypal_plan_id
            })
            logger.info(f"Force-synced plan '{plan.name}' → {paypal_plan_id}")
        except Exception as e:
            logger.error(f"Force-sync failed for '{plan.name}': {e}")
            results.append({
                "plan": plan.name,
                "status": "failed",
                "error": str(e)
            })

    await db.commit()
    return {"message": "Sync complete", "results": results}


# ==================== DISCOUNT CODE VALIDATION ====================

@router.post(
    "/validate-discount",
    summary="Validate a Discount Code",
    responses={
        200: {"description": "Code is valid"},
        400: {"description": "Invalid or expired code"}
    }
)
async def validate_discount_code(
  code: str,
  current_user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db)
):
    """Validate a discount code and return the discount percentage."""
    from app.models.models import DiscountCode
    
    result = await db.execute(
        select(DiscountCode).where(DiscountCode.code == code.strip().upper())
    )
    discount = result.scalars().first()
    
    if not discount:
        raise HTTPException(status_code=400, detail="Invalid discount code")
    
    if discount.is_used:
      raise HTTPException(status_code=400, detail="This code has already been redeemed")
    
    now = datetime.now(timezone.utc)
    if discount.expires_at and discount.expires_at < now:
        raise HTTPException(status_code=400, detail="This discount code has expired")
    
    # Single-use enforcement: mark used on apply
    discount.is_used = True
    discount.used_by_user_id = current_user.id
    discount.used_at = now
    await db.commit()

    return {
      "valid": True,
      "code": discount.code,
      "percent_off": discount.percent_off,
      "message": f"{discount.percent_off}% discount will be applied"
    }


# ==================== USAGE TRACKING ====================

@router.post(
    "/organization/{org_id}/usage/record",
    summary="Record Usage Event",
    responses={
        200: {"description": "Usage recorded"},
        400: {"description": "Invalid usage data"}
    }
)
async def record_usage(
    org_id: UUID,
    usage: UsageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Record usage from media worker.
    Called by worker to emit metering events.
    
    **React Integration Example (Media Worker in Node):**
    
    ```javascript
    // Usage recording helper
    class UsageRecorder {
      constructor(orgId, apiBaseUrl) {
        this.orgId = orgId;
        this.apiBase = apiBaseUrl;
      }
      
      async recordUsage(roomId, minutes) {
        try {
          const response = await fetch(
            `/api/v1/billing/organization/${this.orgId}/usage/record`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                room_id: roomId,
                minutes: minutes
              })
            }
          );
          
          if (!response.ok) {
            console.error('Usage recording failed:', await response.text());
            return null;
          }
          
          return await response.json();
        } catch (error) {
          console.error('Error recording usage:', error);
          return null;
        }
      }
    }
    
    // Usage in media worker
    const recorder = new UsageRecorder(orgId, 'http://localhost:8000');
    
    // Every 10 seconds, emit usage
    setInterval(async () => {
      if (totalSecondsProcessed > 0) {
        const minutes = totalSecondsProcessed / 60;
        await recorder.recordUsage(roomId, minutes);
        totalSecondsProcessed = 0;
      }
    }, 10000);
    ```
    """
    try:
        member = await _get_user_org_membership(db, org_id, current_user.id)
        _verify_org_access(member)

        minutes = usage.minutes
        room_id = usage.room_id
        if minutes < 0:
            raise HTTPException(status_code=400, detail="Minutes must be positive")
        
        if minutes > 600:  # Max 10 minutes per record
            raise HTTPException(status_code=400, detail="Usage record too large")
        
        service = BillingService(db)
        record = await service.create_usage_record(org_id, room_id, minutes)
        await db.commit()
        
        return {
            "id": record.id,
            "minutes": float(record.minutes_used),
            "is_overage": record.is_overage,
            "recorded_at": record.recorded_at
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording usage: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to record usage")


@router.get(
    "/organization/{org_id}/usage/summary",
    response_model=UsageResponse,
    summary="Get Monthly Usage Summary",
    responses={
        200: {"description": "Usage summary"},
        403: {"description": "Access denied"}
    }
)
async def get_usage_summary(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    r"""
    Get monthly usage summary.
    
    **React Integration Example:**
    
    ```javascript
    // hooks/useUsage.js
    import { useState, useEffect } from 'react';
    
    export function useUsageSummary(orgId, token) {
      const [usage, setUsage] = useState(null);
      
      useEffect(() => {
        const fetchUsage = async () => {
          const response = await fetch(
            `/api/v1/billing/organization/${orgId}/usage/summary`,
            {
              headers: { 'Authorization': `Bearer ${token}` }
            }
          );
          
          if (!response.ok) return;
          setUsage(await response.json());
        };
        
        fetchUsage();
        const interval = setInterval(fetchUsage, 10000); // Poll every 10 seconds
        return () => clearInterval(interval);
      }, [orgId, token]);
      
      return usage;
    }
    
    // UsageDisplay.jsx
    import { useUsageSummary } from '../hooks/useUsage';
    
    export function UsageDisplay({ orgId, token }) {
      const usage = useUsageSummary(orgId, token);
      
      if (!usage) return <div>Loading usage...</div>;
      
      const percentUsed = (usage.total_minutes / usage.included_minutes) * 100;
      const overageCharge = usage.estimated_overage_cost;
      
      return (
        <div className="usage-display">
          <h3>Monthly Usage</h3>
          
          <div className="usage-bar">
            <div 
              className={`bar-fill ${percentUsed > 100 ? 'overage' : ''}`}
              style={{width: Math.min(percentUsed, 100) + '%'}}
            />
          </div>
          
          <p>{usage.total_minutes.toFixed(1)} / {usage.included_minutes} minutes</p>
          
          {usage.overage_minutes > 0 && (
            <div className="overage-notice">
              <p>Overage: {usage.overage_minutes.toFixed(1)} minutes</p>
              <p>Estimated cost: \${overageCharge.toFixed(2)}</p>
            </div>
          )}
          
          <p className="period">
            Period: {new Date(usage.period_start).toLocaleDateString()} - 
            {new Date(usage.period_end).toLocaleDateString()}
          </p>
        </div>
      );
    }
    ```
    """
    try:
        member = await _get_user_org_membership(db, org_id, current_user.id)
        _verify_org_access(member)
        
        service = BillingService(db)
        sub = await service.get_org_subscription(org_id)
        
        # Get plan
        plan = None
        if sub:
            plan_result = await db.execute(
                select(Plan).where(Plan.id == sub.plan_id)
            )
            plan = plan_result.scalars().first()
        
        # Get usage this month
        period_start = datetime.utcnow().replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        usage_result = await db.execute(
            select(UsageRecord).where(
                and_(
                    UsageRecord.org_id == org_id,
                    UsageRecord.recorded_at >= period_start
                )
            )
        )
        records = usage_result.scalars().all()
        
        total_minutes = sum(r.minutes_used for r in records) or 0.0
        overage_minutes = 0.0
        if plan and total_minutes > plan.minutes_included:
            overage_minutes = total_minutes - plan.minutes_included
        
        return UsageResponse(
            org_id=org_id,
            period_start=period_start,
            period_end=datetime.utcnow(),
            total_minutes=float(total_minutes),
            included_minutes=plan.minutes_included if plan else 0,
            overage_minutes=float(overage_minutes),
            overage_rate=float(plan.overage_rate_per_min) if plan else 0.0,
            estimated_overage_cost=float(float(overage_minutes) * float(plan.overage_rate_per_min if plan else 0))
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting usage summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage data")



@router.get(
    "/organization/{org_id}/usage/breakdown",
    summary="Get Detailed Usage Breakdown",
    responses={
        200: {"description": "Usage breakdown by room"}
    }
)
async def get_usage_breakdown(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    r"""
    Get detailed usage breakdown by room.
    
    **React Integration Example (Chart Visualization):**
    
    ```javascript
    // hooks/useUsageBreakdown.js
    import { useState, useEffect } from 'react';
    
    export function useUsageBreakdown(orgId, token) {
      const [breakdown, setBreakdown] = useState([]);
      const [totalMinutes, setTotalMinutes] = useState(0);
      
      useEffect(() => {
        const fetchBreakdown = async () => {
          const response = await fetch(
            `/api/v1/billing/organization/${orgId}/usage/breakdown`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          
          if (!response.ok) return;
          
          const data = await response.json();
          setBreakdown(data.breakdown || []);
          setTotalMinutes(data.total_minutes || 0);
        };
        
        fetchBreakdown();
      }, [orgId, token]);
      
      return { breakdown, totalMinutes };
    }
    
    // UsageBreakdownChart.jsx - Real usage chart example
    import React from 'react';
    import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
    import { useUsageBreakdown } from '../hooks/useUsageBreakdown';
    
    const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    
    export function UsageBreakdownChart({ orgId, token }) {
      const { breakdown, totalMinutes } = useUsageBreakdown(orgId, token);
      
      if (!breakdown.length) return <div>No usage data</div>;
      
      return (
        <div className="usage-breakdown">
          <h3>Usage by Room</h3>
          
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="minutes_used"
                nameKey="room_name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, minutes_used }) => 
                  \`\${name}: \${minutes_used.toFixed(1)}m\`
                }
              >
                {breakdown.map((_, index) => (
                  <Cell key={\`cell-\${index}\`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [\`\${value.toFixed(1)} minutes\`, 'Usage']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          
          <div className="breakdown-table">
            <h4>Detailed View</h4>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Minutes</th>
                  <th>% of Total</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map(item => (
                  <tr key={item.room_id}>
                    <td>{item.room_name}</td>
                    <td>{item.minutes_used.toFixed(1)}</td>
                    <td>{((item.minutes_used / totalMinutes) * 100).toFixed(1)}%</td>
                    <td>{new Date(item.last_used).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    ```
    """
    try:
        member = await _get_user_org_membership(db, org_id, current_user.id)
        _verify_org_access(member)
        
        # Get current month start
        period_start = datetime.utcnow().replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        
        # Get usage records grouped by room - using aggregation
        result = await db.execute(
            select(
                UsageRecord.room_id,
                func.sum(UsageRecord.minutes_used).label("total_minutes"),
                func.max(UsageRecord.recorded_at).label("last_used")
            )
            .where(
                and_(
                    UsageRecord.org_id == org_id,
                    UsageRecord.recorded_at >= period_start
                )
            )
            .group_by(UsageRecord.room_id)
            .order_by(func.sum(UsageRecord.minutes_used).desc())
        )
        
        room_usage = result.all()
        
        # Fetch room names for display
        breakdown = []
        total_minutes = 0.0
        for room_id, minutes, last_used in room_usage:
            room_result = await db.execute(
                select(Room.name).where(Room.id == room_id)
            )
            room_name = room_result.scalar() or f"Room {room_id}"
            
            minutes_float = float(minutes) if minutes else 0.0
            total_minutes += minutes_float
            
            breakdown.append({
                "room_id": str(room_id),
                "room_name": room_name,
                "minutes_used": minutes_float,
                "last_used": last_used
            })
        
        return {
            "org_id": org_id,
            "period_start": period_start,
            "period_end": datetime.utcnow(),
            "total_minutes": float(total_minutes),
            "breakdown": breakdown
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting usage breakdown: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch usage breakdown")


# ==================== SUBSCRIPTION MANAGEMENT ====================

@router.post("/organization/{org_id}/cancel-subscription")
async def cancel_subscription(
    org_id: UUID, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    [PAYPAL ONLY] Cancel a PayPal subscription.
    """
    try:
        # 1. Permission check
        member = await _get_user_org_membership(db, org_id, current_user.id)
        if not member or member.role not in ["owner", "admin"]:
            raise HTTPException(
                status_code=403,
                detail="Only organization admins can cancel subscriptions"
            )
            
        # 2. Get current subscription
        service = BillingService(db)
        sub = await service.get_org_subscription(org_id)
        
        if not sub or not sub.paypal_subscription_id:
            raise HTTPException(status_code=404, detail="No active PayPal subscription found")
        
        # 3. Cancel in PayPal
        try:
            success = await paypal_client.cancel_subscription(
                sub.paypal_subscription_id,
                reason="User requested cancellation via AYTME portal"
            )
            if not success:
                raise Exception("PayPal API returned failure")
            
            logger.info(f"PayPal subscription {sub.paypal_subscription_id} cancelled.")
        except Exception as e:
            logger.error(f"PayPal cancellation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"PayPal API error: {str(e)}")
        
        # 4. Update local DB
        sub.status = "canceled"
        sub.cancel_at_period_end = True
        sub.updated_at = datetime.now(timezone.utc)
        await db.commit()
        
        logger.info(f"Subscription cancellation recorded for org {org_id}")
        return {
            "status": "cancelled",
            "message": "Subscription has been cancelled successfully."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling subscription: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to cancel subscription")

