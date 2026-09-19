from fastapi import APIRouter, Depends, HTTPException, Request, status
import logging
from app.core.livekit import livekit_manager
from app.core.redis import get_redis
from app.core.config import settings
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from redis.asyncio import Redis
from datetime import datetime, timedelta
import uuid
import json
from services.billing.paypal_service import paypal_client
from services.billing.webhook_handler import webhook_handler
from app.models.models import (
    Subscription, Invoice, Plan, PayPalWebhookEvent
)

router = APIRouter()
logger = logging.getLogger("webhooks")


@router.post(
    "/livekit",
    status_code=status.HTTP_200_OK,
    summary="LiveKit Webhook Receiver"
)
async def livekit_webhook(request: Request, redis: Redis = Depends(get_redis)):
    """LiveKit room event webhook"""
    try:
        body = await request.body()
        auth_header = request.headers.get("Authorization")
        
        if not auth_header:
            logger.warning("Missing Authorization header in LiveKit webhook")
            raise HTTPException(status_code=401, detail="Missing Authorization header")

        body_str = body.decode("utf-8")
        event = livekit_manager.receive_webhook(body_str, auth_header)
    except Exception as e:
        logger.error(f"Failed to verify LiveKit webhook: {e}")
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    logger.info(f"Received LiveKit Webhook: {event.event}")

    event_data = {
        "event_type": event.event,
        "room_name": event.room.name if event.room else "",
        "participant_identity": event.participant.identity if event.participant else ""
    }
    
    event_payload = {k: v for k, v in event_data.items() if v}

    try:
        await redis.xadd("livekit:webhooks", event_payload)
    except Exception as e:
        logger.error(f"Failed to publish webhook to Redis: {e}")
    
    return {"status": "ok"}





@router.post(
    "/paypal",
    status_code=status.HTTP_200_OK,
    summary="PayPal Webhook Receiver"
)
async def paypal_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """PayPal webhook handler"""
    body = await request.body()
    headers = dict(request.headers)
    
    try:
        # 🔐 DELEGATE: Verification, Idempotency, and Processing
        result = await webhook_handler.process_event(headers, body, db)
        
        await db.commit()
        return result

    except Exception as e:
        logger.error(f"[PAYPAL] Error processing webhook: {str(e)}", exc_info=True)
        await db.rollback()
        # 🚨 SIGNAL FAILURE: Raise 500 so PayPal retries transient failures.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing webhook"
        )


async def handle_paypal_subscription_activated(resource: dict, db: AsyncSession):
    subscription_id = resource.get("id")
    org_id_str = resource.get("custom_id")
    plan_id_paypal = resource.get("plan_id")
    
    if not org_id_str:
        logger.warning(f"[PAYPAL] Activation missing custom_id for subscription {subscription_id}")
        return

    org_id = uuid.UUID(org_id_str)
    
    result = await db.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub = result.scalars().first()
    
    plan_result = await db.execute(select(Plan).where(Plan.paypal_plan_id == plan_id_paypal))
    plan = plan_result.scalars().first()
    
    if not plan:
        logger.error(f"[PAYPAL] Plan not found for PayPal plan ID: {plan_id_paypal}")
        return

    if sub:
        sub.paypal_subscription_id = subscription_id
        sub.billing_provider = "paypal"
        sub.status = "active"
        sub.plan_id = plan.id
        sub.updated_at = datetime.utcnow()
    else:
        sub = Subscription(
            org_id=org_id,
            plan_id=plan.id,
            paypal_subscription_id=subscription_id,
            billing_provider="paypal",
            status="active",
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=30)
        )
        db.add(sub)
    logger.info(f"[PAYPAL] Subscription activated: {subscription_id} for org {org_id}")


async def handle_paypal_subscription_cancelled(resource: dict, db: AsyncSession):
    subscription_id = resource.get("id")
    result = await db.execute(
        select(Subscription).where(Subscription.paypal_subscription_id == subscription_id)
    )
    sub = result.scalars().first()
    if sub:
        sub.status = "canceled"
        sub.updated_at = datetime.utcnow()
        logger.info(f"[PAYPAL] Subscription cancelled: {subscription_id}")


async def handle_paypal_payment_completed(resource: dict, db: AsyncSession):
    subscription_id = resource.get("billing_agreement_id")
    sale_id = resource.get("id")
    amount = float(resource.get("amount", {}).get("total", 0))
    currency = resource.get("amount", {}).get("currency", "USD")
    
    if not subscription_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.paypal_subscription_id == subscription_id)
    )
    sub = result.scalars().first()
    if not sub:
        logger.warning(f"[PAYPAL] Payment completed for unknown subscription: {subscription_id}")
        return

    invoice = Invoice(
        org_id=sub.org_id,
        subscription_id=sub.id,
        paypal_invoice_id=sale_id,
        amount=amount,
        currency=currency,
        status="paid",
        billing_period_start=sub.current_period_start,
        billing_period_end=sub.current_period_end,
        paid_at=datetime.utcnow()
    )
    db.add(invoice)
    logger.info(f"[PAYPAL] Payment recorded for sub {subscription_id}: {sale_id} (${amount})")


async def handle_paypal_subscription_expired(resource: dict, db: AsyncSession):
    subscription_id = resource.get("id")
    result = await db.execute(
        select(Subscription).where(Subscription.paypal_subscription_id == subscription_id)
    )
    sub = result.scalars().first()
    if sub:
        sub.status = "expired"
        sub.updated_at = datetime.utcnow()
        logger.info(f"[PAYPAL] Subscription expired: {subscription_id}")
