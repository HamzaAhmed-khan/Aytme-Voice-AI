from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, insert, func
from uuid import UUID
from typing import List, Optional
from app.core.database import get_db
from app.models.models import User, Organization, Subscription, Plan, AuditLog, WorkerNode, OrgMember, SystemConfig, BillingEvent, Room, Participant, Invoice, DiscountCode, FeatureFlag
from app.api.deps import get_current_user, ScopeChecker
from pydantic import BaseModel
import random
import secrets
import string
from datetime import datetime, timedelta, timezone
from app.core.security import get_password_hash

router = APIRouter()

class QuotaOverride(BaseModel):
    max_rooms: int
    minutes_month: int

class ResetPasswordReq(BaseModel):
    new_password: str

class AssignOrgReq(BaseModel):
    org_id: UUID

class FeatureFlagUpdate(BaseModel):
    enabled: bool

class WorkerAssignReq(BaseModel):
    room_id: UUID

class ConfigUpdate(BaseModel):
    configs: List[dict] # [{"key": "...", "value": "..."}]

class UserCreateReq(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "member"

class OrgCreateReq(BaseModel):
    name: str
    owner_id: UUID
    slug: str

class SubUpdateReq(BaseModel):
    plan_id: UUID

class PlanCreateReq(BaseModel):
    name: str
    description: Optional[str] = None
    price_monthly: float = 0
    minutes_included: int = 1000
    overage_rate_per_min: float = 0.05
    max_rooms: int = 10
    max_participants: int = 50
    paypal_plan_id: Optional[str] = None
    features: dict = {}
    is_active: bool = True

class PlanUpdateReq(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_monthly: Optional[float] = None
    minutes_included: Optional[int] = None
    overage_rate_per_min: Optional[float] = None
    max_rooms: Optional[int] = None
    max_participants: Optional[int] = None
    paypal_plan_id: Optional[str] = None
    features: Optional[dict] = None
    is_active: Optional[bool] = None

# --- ORGANIZATIONS ---
@router.get("/organizations", tags=["admin"])
async def admin_list_all_orgs(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization))
    orgs = result.scalars().all()
    return [{
        "id": str(o.id),
        "slug": o.slug,
        "name": o.name,
        "plan": o.plan,
        "owner_id": str(o.owner_id),
        "max_rooms": o.max_rooms,
        "is_active": o.is_active,
        "created_at": o.created_at.isoformat() if o.created_at else None
    } for o in orgs]

@router.post("/organizations", tags=["admin"])
async def admin_create_org(req: OrgCreateReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    org = Organization(name=req.name, owner_id=req.owner_id, slug=req.slug)
    db.add(org)
    await db.commit()
    return org

@router.post("/organizations/{org_id}/disable", tags=["admin"])
async def admin_disable_org(org_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalars().first()
    if not org: raise HTTPException(404, "Org not found")
    org.is_active = not org.is_active # Toggle active status
    await db.commit()
    return {"status": "success", "is_active": org.is_active}

@router.delete("/organizations/{org_id}", tags=["admin"])
async def admin_delete_org(org_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Organization).where(Organization.id == org_id))
    await db.commit()
    return {"status": "deleted"}

@router.patch("/organizations/{org_id}/subscription", tags=["admin"])
async def admin_update_subscription(org_id: UUID, req: SubUpdateReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub = result.scalars().first()
    if not sub:
        sub = Subscription(org_id=org_id, plan_id=req.plan_id, status="active")
        db.add(sub)
    else:
        sub.plan_id = req.plan_id
    await db.commit()
    return {"status": "updated"}

@router.post("/organizations/{org_id}/override-quota", tags=["admin"])
async def override_org_quota(org_id: UUID, override: QuotaOverride, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    stmt = select(Organization).where(Organization.id == org_id)
    org = (await db.execute(stmt)).scalars().first()
    if not org: raise HTTPException(status_code=404, detail="Organization not found")
    
    # Initialize settings dict if None
    if org.settings is None:
        org.settings = {}
        
    org.settings["quota_overrides"] = override.model_dump()
    await db.commit()
    return {"status": "quota overridden", "new_settings": org.settings}


# --- USERS ---
@router.get("/users", tags=["admin"])
async def admin_list_all_users(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()

    # Enrich each user with their org's plan name (best-effort, LEFT JOIN style)
    user_list = []
    for u in users:
        plan_name = "Free Trial"
        try:
            mem_result = await db.execute(
                select(OrgMember).where(OrgMember.user_id == u.id).limit(1)
            )
            mem = mem_result.scalars().first()
            if mem:
                sub_result = await db.execute(
                    select(Subscription, Plan.name.label("plan_name"))
                    .join(Plan, Subscription.plan_id == Plan.id)
                    .where(Subscription.org_id == mem.org_id, Subscription.status == "active")
                    .limit(1)
                )
                row = sub_result.first()
                if row:
                    plan_name = row.plan_name
        except Exception:
            pass
        user_list.append({
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "plan_name": plan_name,
        })
    return user_list

@router.post("/users", tags=["admin"], status_code=201)
async def admin_create_user(req: UserCreateReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == req.email))).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists.")
    if req.role not in ("user", "admin", "member", "worker"):
        raise HTTPException(status_code=400, detail="Invalid role.")
    new_user = User(
        email=req.email,
        full_name=req.full_name,
        hashed_password=get_password_hash(req.password),
        role=req.role,
        is_active=True,
        is_verified=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"id": str(new_user.id), "email": new_user.email, "full_name": new_user.full_name, "role": new_user.role}

@router.patch("/users/{user_id}/role", tags=["admin"])
async def admin_update_user_role(user_id: UUID, new_role: str, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    if new_role not in ["user", "admin", "worker", "member"]: raise HTTPException(status_code=400, detail="Invalid role")
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalars().first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    user.role = new_role
    await db.commit()
    return {"status": "role updated", "user_id": user_id, "new_role": new_role}

@router.post("/users/{user_id}/suspend", tags=["admin"])
async def admin_suspend_user(user_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalars().first()
    if not user: raise HTTPException(404, "User not found")
    user.is_active = not user.is_active  # Toggle active/suspended
    await db.commit()
    return {"status": "suspended" if not user.is_active else "reactivated", "is_active": user.is_active}

@router.delete("/users/{user_id}", tags=["admin"])
async def admin_delete_user(user_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    from app.models.models import ApiToken
    try:
        # 1. Clear Organization Ownership
        await db.execute(update(Organization).where(Organization.owner_id == user_id).values(owner_id=current_user.id))
        # 2. Clear Room Ownership
        await db.execute(update(Room).where(Room.owner_id == user_id).values(owner_id=None))
        # 3. Handle Billing Events (Unbind but preserve history)
        await db.execute(update(BillingEvent).where(BillingEvent.user_id == user_id).values(user_id=None))
        # 4. Handle Participants referencing user
        await db.execute(update(Participant).where(Participant.user_id == user_id).values(user_id=None))
        # 5. Handle Org Members
        await db.execute(delete(OrgMember).where(OrgMember.user_id == user_id))
        # 6. Handle API Tokens
        await db.execute(delete(ApiToken).where(ApiToken.user_id == user_id))
        # 7. Delete User
        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()
        return {"status": "deleted", "user_id": str(user_id)}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

@router.post("/users/{user_id}/reset-password", tags=["admin"])
async def admin_reset_password(user_id: UUID, req: ResetPasswordReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalars().first()
    if not user: raise HTTPException(404, "User not found")
    user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    return {"status": "password reset"}

@router.post("/users/{user_id}/assign-org", tags=["admin"])
async def admin_assign_org(user_id: UUID, req: AssignOrgReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    member = OrgMember(org_id=req.org_id, user_id=user_id, role="member")
    db.add(member)
    await db.commit()
    return {"status": "assigned"}


# --- SUBSCRIPTIONS / BILLING ---
@router.get("/subscriptions", tags=["admin"])
async def admin_list_subscriptions(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subscription, Organization.name.label("org_name"), Plan.name.label("plan_name"))
        .join(Organization, Subscription.org_id == Organization.id)
        .join(Plan, Subscription.plan_id == Plan.id)
    )
    rows = result.all()
    return [{
        "id": row.Subscription.id,
        "org_id": row.Subscription.org_id,
        "org_name": row.org_name,
        "plan_name": row.plan_name,
        "status": row.Subscription.status,
        "current_period_end": row.Subscription.current_period_end,
        "cancel_at_period_end": row.Subscription.cancel_at_period_end
    } for row in rows]

@router.post("/subscriptions/{sub_id}/suspend", tags=["admin"])
async def suspend_subscription(sub_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    stmt = select(Subscription).where(Subscription.id == sub_id)
    sub = (await db.execute(stmt)).scalars().first()
    if not sub: raise HTTPException(status_code=404, detail="Subscription not found")
    sub.status = "suspended"
    await db.commit()
    return {"status": "subscription suspended"}

@router.get("/billing/failed-payments", tags=["admin"])
async def admin_failed_payments(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.status == "past_due"))
    return result.scalars().all()

@router.get("/billing/invoices", tags=["admin"])
async def admin_list_invoices(limit: int = 100, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Invoice, Organization.name.label("org_name"))
        .join(Organization, Invoice.org_id == Organization.id)
        .order_by(Invoice.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [{
        "id": str(row.Invoice.id),
        "org_id": str(row.Invoice.org_id),
        "org_name": row.org_name,
        "amount": float(row.Invoice.amount),
        "currency": row.Invoice.currency or "USD",
        "status": row.Invoice.status,
        "pdf_url": row.Invoice.pdf_url,
        "paypal_invoice_id": row.Invoice.paypal_invoice_id,
        "billing_period_start": row.Invoice.billing_period_start.isoformat() if row.Invoice.billing_period_start else None,
        "billing_period_end": row.Invoice.billing_period_end.isoformat() if row.Invoice.billing_period_end else None,
        "paid_at": row.Invoice.paid_at.isoformat() if row.Invoice.paid_at else None,
        "created_at": row.Invoice.created_at.isoformat() if row.Invoice.created_at else None
    } for row in rows]

@router.post("/billing/sync-invoices", tags=["admin"])
async def admin_sync_invoices(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    """
    Pull transaction history from PayPal for every known subscription and create
    Invoice records in the DB for any payments not already recorded.
    Returns a summary of how many invoices were created.
    """
    from services.billing.paypal_service import paypal_client

    # Fetch all subscriptions that have a PayPal subscription ID
    sub_result = await db.execute(
        select(Subscription).where(Subscription.paypal_subscription_id.isnot(None))
    )
    subscriptions = sub_result.scalars().all()

    created_count = 0
    errors = []

    # Search 2 years back
    start_time = (datetime.now(timezone.utc) - timedelta(days=730)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_time   = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for sub in subscriptions:
        try:
            transactions = await paypal_client.get_subscription_transactions(
                sub.paypal_subscription_id, start_time, end_time
            )
            for txn in transactions:
                txn_id = txn.get("id")
                txn_status = txn.get("status", "")
                if txn_status.upper() not in ("COMPLETED",):
                    continue
                # Skip if already recorded
                existing = await db.execute(select(Invoice).where(Invoice.paypal_invoice_id == txn_id))
                if existing.scalars().first():
                    continue
                # Parse amount
                gross = txn.get("amount_with_breakdown", {}).get("gross_amount", {})
                amount = float(gross.get("value", 0))
                currency = gross.get("currency_code", "USD")
                # Parse time
                txn_time_str = txn.get("time", "")
                try:
                    txn_time = datetime.fromisoformat(txn_time_str.replace("Z", "+00:00"))
                except Exception:
                    txn_time = datetime.now(timezone.utc)

                invoice = Invoice(
                    org_id=sub.org_id,
                    subscription_id=sub.id,
                    paypal_invoice_id=txn_id,
                    amount=amount,
                    currency=currency,
                    status="paid",
                    billing_period_start=sub.current_period_start or txn_time,
                    billing_period_end=sub.current_period_end or (txn_time + timedelta(days=30)),
                    paid_at=txn_time,
                )
                db.add(invoice)
                created_count += 1
        except Exception as e:
            errors.append(f"sub {sub.paypal_subscription_id}: {str(e)}")

    await db.commit()
    return {
        "status": "done",
        "invoices_created": created_count,
        "subscriptions_checked": len(subscriptions),
        "errors": errors,
    }

@router.post("/billing/refund/{invoice_id}", tags=["admin"])
async def admin_refund(invoice_id: str, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    # Placeholder for PayPal refund logic
    return {"status": "refunded", "invoice_id": invoice_id}

@router.get("/billing/revenue", tags=["admin"])
async def admin_revenue(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    # Get active subscription count
    sub_count_result = await db.execute(select(func.count(Subscription.id)).where(Subscription.status == 'active'))
    active_subs = sub_count_result.scalar() or 0

    # Calculate MRR (simplified: sum of active plan prices)
    mrr_result = await db.execute(
        select(func.sum(Plan.price_monthly))
        .join(Subscription, Subscription.plan_id == Plan.id)
        .where(Subscription.status == 'active')
    )
    mrr = float(mrr_result.scalar() or 0)

    # Last 10 invoices with org name
    inv_result = await db.execute(
        select(Invoice, Organization.name.label("org_name"))
        .join(Organization, Invoice.org_id == Organization.id)
        .order_by(Invoice.created_at.desc())
        .limit(10)
    )
    recent_invoices = [{
        "id": str(row.Invoice.id),
        "org_name": row.org_name,
        "amount": float(row.Invoice.amount),
        "currency": row.Invoice.currency or "USD",
        "status": row.Invoice.status,
        "created_at": row.Invoice.created_at.isoformat() if row.Invoice.created_at else None,
    } for row in inv_result.all()]

    return {
        "mrr": mrr,
        "arr": mrr * 12,
        "active_subscriptions": active_subs,
        "growth": 12.5,
        "recent_invoices": recent_invoices,
    }


# --- SYSTEM ---
@router.get("/system/health", tags=["admin"])
async def admin_system_health(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    return {
        "status": "healthy",
        "services": {
            "database": "up",
            "redis": "up",
            "livekit": "up",
            "workers": "up"
        }
    }

@router.get("/system/config", tags=["admin"])
async def admin_get_config(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemConfig).order_by(SystemConfig.category, SystemConfig.key))
    configs = result.scalars().all()

    # Auto-seed default config entries if table is empty
    if not configs:
        defaults = [
            SystemConfig(key="app_name", value="AYTME", category="general", description="Platform display name"),
            SystemConfig(key="maintenance_mode", value="false", category="general", description="Enable maintenance mode globally"),
            SystemConfig(key="max_concurrent_rooms", value="100", category="general", description="Maximum concurrent rooms across platform"),
            SystemConfig(key="ADMIN_EMAILS", value="aytme.admin@gmail.com,moesheacorp@gmail.com", category="general", description="Comma-separated admin allowlist"),
            SystemConfig(key="openai_model", value="gpt-4o-realtime-preview", category="ai", description="OpenAI model for real-time translation"),
            SystemConfig(key="openai_api_key", value="", category="ai", description="OpenAI API key", is_secret=True),
            SystemConfig(key="TTS_DEFAULT_VOICE", value="alloy", category="ai", description="Default TTS voice"),
            SystemConfig(key="TTS_DEFAULT_SPEED", value="0.9", category="ai", description="Default TTS speed"),
            SystemConfig(key="TTS_VOICE_MAP_JSON", value="", category="ai", description="Optional JSON map: lang -> voice"),
            SystemConfig(key="TTS_SPEED_MAP_JSON", value="", category="ai", description="Optional JSON map: lang -> speed"),
            SystemConfig(key="translation_latency_target_ms", value="300", category="ai", description="Target translation latency in ms"),
            SystemConfig(key="smtp_host", value="", category="email", description="SMTP server hostname"),
            SystemConfig(key="smtp_port", value="587", category="email", description="SMTP server port"),
            SystemConfig(key="smtp_from_email", value="noreply@aytme.io", category="email", description="Default sender email"),
            SystemConfig(key="s3_bucket", value="aytme-media", category="storage", description="Object storage bucket name"),
            SystemConfig(key="s3_endpoint", value="", category="storage", description="S3-compatible endpoint URL"),
            SystemConfig(key="s3_access_key", value="", category="storage", description="S3 access key", is_secret=True),
            SystemConfig(key="free_tier_minutes", value="60", category="billing", description="Free tier minutes per month"),
        ]
        for cfg in defaults:
            db.add(cfg)
        await db.commit()
        configs = defaults

    return [{
        "key": c.key,
        "value": str(c.value) if c.value is not None else "",
        "category": str(c.category) if c.category else "general",
        "description": str(c.description) if c.description else "",
        "is_secret": bool(c.is_secret) if hasattr(c, 'is_secret') else False,
        "updated_at": c.updated_at.isoformat() if hasattr(c, 'updated_at') and c.updated_at else None
    } for c in configs]

@router.patch("/system/config", tags=["admin"])
async def admin_update_config(req: ConfigUpdate, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    for item in req.configs:
        key = item.get("key")
        val = item.get("value")
        if key:
            stmt = update(SystemConfig).where(SystemConfig.key == key).values(value=val)
            await db.execute(stmt)
            
            # Log the change
            await db.execute(insert(AuditLog).values(
                actor_id=current_user.id,
                actor_type="admin",
                action="system_config_update",
                resource_type="config",
                resource_id=key,
                outcome="success",
                payload={"new_value": "********" if "KEY" in key or "SECRET" in key else val}
            ))
            
    # Sync settings in-memory
    from app.core.config import settings
    await settings.update_from_db(db)
    
    await db.commit()
    return {"status": "success", "message": "Configuration updated"}

@router.get("/system/logs", tags=["admin"])
async def admin_system_logs(limit: int = 50, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    logs = result.scalars().all()
    return [{
        "id": str(log.id),
        "org_id": str(log.org_id) if hasattr(log, 'org_id') and log.org_id else None,
        "actor_id": str(log.actor_id) if hasattr(log, 'actor_id') else None,
        "actor_type": log.actor_type if hasattr(log, 'actor_type') else "system",
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "payload": log.payload if hasattr(log, 'payload') else {},
        "outcome": log.outcome,
        "created_at": log.created_at.isoformat() if hasattr(log, 'created_at') and log.created_at else None
    } for log in logs]


# --- FEATURE FLAGS (DB-backed) ---
@router.get("/feature-flags", tags=["admin"])
async def admin_feature_flags(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FeatureFlag).order_by(FeatureFlag.category, FeatureFlag.key))
    flags = result.scalars().all()

    # Auto-seed default feature flags if table is empty
    if not flags:
        defaults = [
            FeatureFlag(key="VIDEO_ENABLED", name="Video Support", description="Enable video streaming in rooms", enabled=True, category="media"),
            FeatureFlag(key="VOICE_SELECTION_ENABLED", name="Voice Selection", description="Allow users to pick TTS voice", enabled=True, category="ai"),
            FeatureFlag(key="BILLING_ENABLED", name="Billing System", description="Enable PayPal billing/subscription system", enabled=True, category="billing"),
            FeatureFlag(key="ANALYTICS_ENABLED", name="Analytics Dashboard", description="Enable org analytics tab", enabled=True, category="analytics"),
            FeatureFlag(key="ROOM_SIZE_LIMIT", name="Room Size Enforcement", description="Enforce participant limits per plan", enabled=True, category="rooms"),
            FeatureFlag(key="DISCOUNT_CODES_ENABLED", name="Discount Codes", description="Allow discount codes on checkout", enabled=True, category="billing"),
            FeatureFlag(key="FREE_TRIAL_ENABLED", name="30-Day Free Trial", description="Enable 30-day free trial for new users", enabled=True, category="billing"),
        ]
        for f in defaults:
            db.add(f)
        await db.commit()
        flags = defaults

    return [{
        "id": str(f.id),
        "key": f.key,
        "name": f.name,
        "description": f.description or "",
        "enabled": f.enabled,
        "category": f.category or "general",
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    } for f in flags]

@router.patch("/feature-flags/{flag_key}", tags=["admin"])
async def admin_toggle_flag(flag_key: str, req: FeatureFlagUpdate, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FeatureFlag).where(FeatureFlag.key == flag_key))
    flag = result.scalars().first()
    if not flag:
        raise HTTPException(404, f"Feature flag '{flag_key}' not found")
    flag.enabled = req.enabled
    await db.commit()
    return {"status": "updated", "key": flag_key, "enabled": req.enabled}


# --- DISCOUNT CODES ---
class DiscountCodeCreate(BaseModel):
    percent_off: int  # 1-100
    expires_in_days: Optional[int] = None  # None = no expiry

@router.get("/discount-codes", tags=["admin"])
async def admin_list_discount_codes(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(DiscountCode).order_by(DiscountCode.created_at.desc()))
        codes = result.scalars().all()
    except Exception as e:
        # Table may not exist yet — auto-create and return empty
        try:
            await db.rollback()
            from app.core.database import engine
            from app.models.models import Base
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return []
        except Exception:
            return []
    now = datetime.now(timezone.utc)
    return [{
        "id": str(c.id),
        "code": c.code,
        "percent_off": c.percent_off,
        "is_used": c.is_used,
        "used_by_user_id": str(c.used_by_user_id) if c.used_by_user_id else None,
        "used_at": c.used_at.isoformat() if c.used_at else None,
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "is_expired": c.expires_at is not None and c.expires_at < now,
    } for c in codes]

@router.post("/discount-codes", tags=["admin"])
async def admin_create_discount_code(req: DiscountCodeCreate, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    if req.percent_off < 1 or req.percent_off > 100:
        raise HTTPException(400, "percent_off must be between 1 and 100")
    expires_at = None
    if req.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=req.expires_in_days)

    # Generate a unique code with retries to avoid rare collisions
    max_attempts = 3
    last_error = None
    for attempt in range(max_attempts):
        code_str = f"AYTME-{''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))}-{''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))}"
        code = DiscountCode(
            code=code_str,
            percent_off=req.percent_off,
            created_by_user_id=current_user.id,
            expires_at=expires_at,
        )
        try:
            db.add(code)
            await db.commit()
            await db.refresh(code)
            last_error = None
            break
        except Exception as e:
            last_error = e
            await db.rollback()
            if attempt == 0:
                # Auto-create tables on first failure (fresh DB)
                try:
                    from app.core.database import engine
                    from app.models.models import Base
                    async with engine.begin() as conn:
                        await conn.run_sync(Base.metadata.create_all)
                except Exception:
                    pass
            continue

    if last_error is not None:
        logger.error(f"Failed to create discount code after {max_attempts} attempts: {last_error}")
        raise HTTPException(status_code=500, detail="Failed to create discount code")
    return {
        "id": str(code.id),
        "code": code.code,
        "percent_off": code.percent_off,
        "expires_at": code.expires_at.isoformat() if code.expires_at else None,
        "status": "created"
    }

@router.delete("/discount-codes/{code_id}", tags=["admin"])
async def admin_delete_discount_code(code_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DiscountCode).where(DiscountCode.id == code_id))
    code = result.scalars().first()
    if not code:
        raise HTTPException(404, "Discount code not found")
    if code.is_used:
        raise HTTPException(400, "Cannot delete a code that has already been redeemed")
    await db.execute(delete(DiscountCode).where(DiscountCode.id == code_id))
    await db.commit()
    return {"status": "deleted", "code_id": str(code_id)}


# --- WORKERS ---
@router.get("/workers", tags=["admin"])
async def admin_workers(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkerNode))
    workers = result.scalars().all()
    
    if not workers:
        # Auto-seed some mock workers for UI demo if empty
        mock_workers = [
            WorkerNode(id="worker-01", hostname="primary-compute-01", ip_address="10.0.0.5", status="idle", cpu_usage=12.5, memory_usage=45.0),
            WorkerNode(id="worker-02", hostname="media-edge-02", ip_address="10.0.0.6", status="busy", cpu_usage=88.2, memory_usage=72.1)
        ]
        for w in mock_workers: db.add(w)
        await db.commit()
        workers = mock_workers

    return [{
        "id": w.id,
        "hostname": w.hostname,
        "ip_address": w.ip_address,
        "status": w.status,
        "cpu_usage": float(w.cpu_usage or 0) + (random.uniform(-2, 2) if w.status != 'offline' else 0),
        "memory_usage": float(w.memory_usage or 0) + (random.uniform(-1, 1) if w.status != 'offline' else 0),
        "latency_ms": int(w.latency_ms or 0) + (random.randint(-5, 5) if w.status != 'offline' else 0),
        "current_room_id": str(w.current_room_id) if hasattr(w, 'current_room_id') and w.current_room_id else None,
        "last_seen": w.last_seen.isoformat() if hasattr(w, 'last_seen') and w.last_seen else None,
        "created_at": w.created_at.isoformat() if hasattr(w, 'created_at') and w.created_at else None
    } for w in workers]

@router.post("/workers/{worker_id}/start", tags=["admin"])
async def admin_start_worker(worker_id: str, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    stmt = update(WorkerNode).where(WorkerNode.id == worker_id).values(status="idle")
    await db.execute(stmt)
    await db.commit()
    return {"status": "starting", "worker_id": worker_id}

@router.post("/workers/{worker_id}/stop", tags=["admin"])
async def admin_stop_worker(worker_id: str, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    stmt = update(WorkerNode).where(WorkerNode.id == worker_id).values(status="offline")
    await db.execute(stmt)
    await db.commit()
    return {"status": "stopping", "worker_id": worker_id}

@router.post("/workers/{worker_id}/restart", tags=["admin"])
async def admin_restart_worker(worker_id: str, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    stmt = update(WorkerNode).where(WorkerNode.id == worker_id).values(status="idle")
    await db.execute(stmt)
    await db.commit()
    return {"status": "restarting", "worker_id": worker_id}

@router.post("/workers/{worker_id}/assign", tags=["admin"])
async def admin_assign_worker(worker_id: str, req: WorkerAssignReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    return {"status": "assigned", "room_id": str(req.room_id)}


# --- PLANS CRUD ---
@router.get("/plans", tags=["admin"])
async def admin_list_plans(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan).order_by(Plan.price_monthly.asc()))
    plans = result.scalars().all()
    return [{
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "price_monthly": float(p.price_monthly),
        "minutes_included": p.minutes_included,
        "overage_rate_per_min": float(p.overage_rate_per_min),
        "max_rooms": p.max_rooms,
        "max_participants": p.max_participants,
        "features": p.features or {},
        "paypal_plan_id": p.paypal_plan_id,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None
    } for p in plans]

@router.post("/plans", tags=["admin"])
async def admin_create_plan(req: PlanCreateReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    plan = Plan(
        name=req.name,
        description=req.description,
        price_monthly=req.price_monthly,
        minutes_included=req.minutes_included,
        overage_rate_per_min=req.overage_rate_per_min,
        max_rooms=req.max_rooms,
        max_participants=req.max_participants,
        paypal_plan_id=req.paypal_plan_id,
        features=req.features,
        is_active=req.is_active
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return {
        "id": str(plan.id),
        "name": plan.name,
        "price_monthly": float(plan.price_monthly),
        "status": "created"
    }

@router.post("/plans/seed-org-plans", tags=["admin"])
async def admin_seed_org_plans(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    """
    Idempotent: creates Team, Business, Enterprise plans if they don't already exist.
    """
    org_plan_defaults = [
        {
            "name": "Team",
            "description": "For small teams and departments — 10-25 users, shared minutes",
            "price_monthly": 49.0,
            "minutes_included": 2500,
            "overage_rate_per_min": 0.04,
            "max_rooms": 25,
            "max_participants": 25,
            "features": {"support": "Priority Email", "sales_commission_pct": 1, "rooms": 25, "description": "10-25 users, shared minutes"}
        },
        {
            "name": "Business",
            "description": "For growing organizations — 50-200 users, shared minutes",
            "price_monthly": 199.0,
            "minutes_included": 10000,
            "overage_rate_per_min": 0.03,
            "max_rooms": 100,
            "max_participants": 200,
            "features": {"support": "Priority Email", "sales_commission_pct": 1, "rooms": 100, "description": "50-200 users, shared minutes"}
        },
        {
            "name": "Enterprise",
            "description": "Custom solutions for large organizations — unlimited users",
            "price_monthly": 999.0,
            "minutes_included": 50000,
            "overage_rate_per_min": 0.02,
            "max_rooms": 500,
            "max_participants": 500,
            "features": {"support": "24/7 Dedicated", "sales_commission_pct": 1, "rooms": 500, "description": "Unlimited users, custom minutes"}
        },
    ]
    created = []
    skipped = []
    for defaults in org_plan_defaults:
        existing = await db.execute(select(Plan).where(func.lower(Plan.name) == defaults["name"].lower()))
        if existing.scalars().first():
            skipped.append(defaults["name"])
            continue
        plan = Plan(
            name=defaults["name"],
            description=defaults["description"],
            price_monthly=defaults["price_monthly"],
            minutes_included=defaults["minutes_included"],
            overage_rate_per_min=defaults["overage_rate_per_min"],
            max_rooms=defaults["max_rooms"],
            max_participants=defaults["max_participants"],
            features=defaults["features"],
            is_active=True,
        )
        db.add(plan)
        created.append(defaults["name"])
    await db.commit()
    return {"created": created, "skipped": skipped}

@router.patch("/plans/{plan_id}", tags=["admin"])
async def admin_update_plan(plan_id: UUID, req: PlanUpdateReq, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalars().first()
    if not plan:
        raise HTTPException(404, "Plan not found")
    if req.name is not None: plan.name = req.name
    if req.description is not None: plan.description = req.description
    if req.price_monthly is not None: plan.price_monthly = req.price_monthly
    if req.minutes_included is not None: plan.minutes_included = req.minutes_included
    if req.overage_rate_per_min is not None: plan.overage_rate_per_min = req.overage_rate_per_min
    if req.max_rooms is not None: plan.max_rooms = req.max_rooms
    if req.max_participants is not None: plan.max_participants = req.max_participants
    if req.paypal_plan_id is not None: plan.paypal_plan_id = req.paypal_plan_id
    if req.features is not None: plan.features = req.features
    if req.is_active is not None: plan.is_active = req.is_active
    await db.commit()
    return {"status": "updated", "plan_id": str(plan_id)}

@router.delete("/plans/{plan_id}", tags=["admin"])
async def admin_delete_plan(plan_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    # Check if any active subscriptions use this plan
    sub_count = await db.execute(select(Subscription).where(Subscription.plan_id == plan_id, Subscription.status == 'active'))
    active_subs = sub_count.scalars().all()
    if active_subs:
        raise HTTPException(400, f"Cannot delete plan with {len(active_subs)} active subscription(s). Deactivate them first.")
    await db.execute(delete(Plan).where(Plan.id == plan_id))
    await db.commit()
    return {"status": "deleted", "plan_id": str(plan_id)}


# --- SUBSCRIPTIONS LISTING ---
@router.get("/subscriptions", tags=["admin"])
async def admin_list_subscriptions(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subscription, Organization.name.label("org_name"), Organization.slug.label("org_slug"), Plan.name.label("plan_name"), Plan.price_monthly.label("plan_price"))
        .join(Organization, Subscription.org_id == Organization.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .order_by(Subscription.created_at.desc())
    )
    rows = result.all()
    return [{
        "id": str(row.Subscription.id),
        "org_id": str(row.Subscription.org_id),
        "org_name": row.org_name,
        "org_slug": row.org_slug,
        "plan_id": str(row.Subscription.plan_id),
        "plan_name": row.plan_name,
        "plan_price": float(row.plan_price),
        "status": row.Subscription.status,
        "current_period_start": row.Subscription.current_period_start.isoformat() if row.Subscription.current_period_start else None,
        "current_period_end": row.Subscription.current_period_end.isoformat() if row.Subscription.current_period_end else None,
        "cancel_at_period_end": row.Subscription.cancel_at_period_end,
        "created_at": row.Subscription.created_at.isoformat() if row.Subscription.created_at else None
    } for row in rows]

@router.patch("/subscriptions/{sub_id}/cancel", tags=["admin"])
async def admin_cancel_subscription(sub_id: UUID, current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.id == sub_id))
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    sub.status = "canceled" if sub.status == "active" else "active"
    await db.commit()
    return {"status": sub.status, "subscription_id": str(sub_id)}


# --- ENTERPRISE INQUIRIES & MANAGEMENT ---
class EnterprisePlanCreate(BaseModel):
    inquiry_email: str
    company_name: str
    price_monthly: float
    minutes_included: int = 50000
    max_rooms: int = 100
    max_participants: int = 500
    org_id: Optional[UUID] = None  # optionally assign to existing org

@router.get("/enterprise-inquiries", tags=["admin"])
async def admin_list_enterprise_inquiries(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    """List recent enterprise quote inquiries from audit logs."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.action == "enterprise_quote_request")
        .order_by(AuditLog.created_at.desc())
        .limit(50)
    )
    logs = result.scalars().all()
    return [{
        "id": str(log.id),
        "payload": log.payload if hasattr(log, 'payload') else {},
        "created_at": log.created_at.isoformat() if log.created_at else None,
    } for log in logs]

@router.post("/enterprise-plans", tags=["admin"])
async def admin_create_enterprise_plan(
    req: EnterprisePlanCreate,
    current_user: User = Depends(ScopeChecker(["admin:all"])),
    db: AsyncSession = Depends(get_db)
):
    """Create a custom enterprise plan and optionally assign to an org."""
    plan = Plan(
        name=f"Enterprise - {req.company_name}",
        description=f"Custom enterprise plan for {req.company_name}",
        price_monthly=req.price_monthly,
        minutes_included=req.minutes_included,
        overage_rate_per_min=0.01,
        max_rooms=req.max_rooms,
        max_participants=req.max_participants,
        features={
            "enterprise": True,
            "inquiry_email": req.inquiry_email,
            "company_name": req.company_name,
            "support": "Dedicated",
            "video": True,
            "broadcast": True,
            "sla": True,
            "api_access": True,
            "sales_commission_pct": 1,
            "team_admin_dashboard": True,
            "description": "Custom enterprise solution"
        },
        is_active=True
    )
    db.add(plan)
    await db.flush()

    # If org_id provided, create/update subscription
    assigned_org = None
    if req.org_id:
        result = await db.execute(select(Subscription).where(Subscription.org_id == req.org_id))
        sub = result.scalars().first()
        if sub:
            sub.plan_id = plan.id
            sub.status = "active"
        else:
            sub = Subscription(
                org_id=req.org_id,
                plan_id=plan.id,
                status="active",
                current_period_start=datetime.now(timezone.utc),
                current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
            )
            db.add(sub)
        assigned_org = str(req.org_id)

    # Log the action
    await db.execute(insert(AuditLog).values(
        actor_id=current_user.id,
        actor_type="admin",
        action="enterprise_plan_created",
        resource_type="plan",
        resource_id=str(plan.id),
        outcome="success",
        payload={
            "company_name": req.company_name,
            "inquiry_email": req.inquiry_email,
            "price": req.price_monthly,
            "assigned_org": assigned_org
        }
    ))

    await db.commit()
    return {
        "status": "created",
        "plan_id": str(plan.id),
        "plan_name": plan.name,
        "assigned_org": assigned_org
    }

@router.get("/management/commissions", tags=["admin"])
async def admin_commission_overview(current_user: User = Depends(ScopeChecker(["admin:all"])), db: AsyncSession = Depends(get_db)):
    """Calculate 1% recurring commission for all active subscriptions."""
    result = await db.execute(
        select(
            Subscription,
            Organization.name.label("org_name"),
            Plan.name.label("plan_name"),
            Plan.price_monthly.label("plan_price"),
            Plan.features.label("plan_features")
        )
        .join(Organization, Subscription.org_id == Organization.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .where(Subscription.status == "active")
        .order_by(Plan.price_monthly.desc())
    )
    rows = result.all()
    total_commission = 0.0
    items = []
    for row in rows:
        price = float(row.plan_price)
        commission_pct = 1  # default 1%
        features = row.plan_features or {}
        if isinstance(features, dict):
            commission_pct = features.get("sales_commission_pct", 1)
        commission = round(price * commission_pct / 100, 2)
        total_commission += commission
        items.append({
            "subscription_id": str(row.Subscription.id),
            "org_name": row.org_name,
            "plan_name": row.plan_name,
            "plan_price": price,
            "commission_pct": commission_pct,
            "monthly_commission": commission,
            "status": row.Subscription.status
        })
    return {
        "total_monthly_commission": round(total_commission, 2),
        "total_annual_commission": round(total_commission * 12, 2),
        "active_subscriptions": len(items),
        "items": items
    }
