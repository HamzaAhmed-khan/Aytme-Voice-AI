from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.models import Quota, Room, Subscription, Plan, UsageRecord
from fastapi import HTTPException, status
import logging
from datetime import datetime, timezone

logger = logging.getLogger("quota_service")

# Plans that belong to individual users — no concurrent room cap applies.
# Org plans (Team, Business, Enterprise) keep their max_rooms enforcement.
INDIVIDUAL_PLAN_NAMES = frozenset({"starter", "pro", "premium"})

class QuotaService:
    """
    Section 12: Billing & Quotas Enforcement Logic.
    Handles per-organization resource limits.
    """
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_org_limits(self, org_id: UUID):
        """Fetches limits based on the organization's subscription plan."""
        stmt = select(Plan).join(Subscription).where(Subscription.org_id == org_id)
        result = await self.db.execute(stmt)
        plan = result.scalar_one_or_none()

        if not plan:
            # Fallback to hardcoded safe defaults (Free tier)
            return {
                "max_rooms": 3,
                "max_minutes": 60,
                "max_participants": 5
            }

        # Individual plans have no concurrent room cap — return None to signal skip.
        is_individual = plan.name.lower() in INDIVIDUAL_PLAN_NAMES

        return {
            "max_rooms": None if is_individual else plan.max_rooms,
            "max_minutes": plan.minutes_included,
            "max_participants": plan.max_participants
        }

    async def check_room_quota(self, org_id: UUID):
        """Checks if organization has reached its concurrent room limit.
        Individual plans (Starter/Pro/Premium) skip this check — no cap applies."""
        limits = await self.get_org_limits(org_id)
        max_rooms = limits["max_rooms"]

        # None means no cap (individual plan) — skip enforcement.
        if max_rooms is None:
            return True

        # Count active rooms
        active_result = await self.db.execute(
            select(func.count(Room.id)).where(
                Room.org_id == org_id,
                Room.status.in_(["pending", "active"])
            )
        )
        active_count = active_result.scalar() or 0

        if active_count >= max_rooms:
            logger.warning(f"Org {org_id} reached room quota ({active_count}/{max_rooms})")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "QUOTA_EXCEEDED",
                    "type": "max_rooms",
                    "limit": max_rooms,
                    "current": active_count,
                    "message": f"Resource quota exceeded: Concurrent rooms limit reached ({max_rooms})"
                }
            )

        return True

    async def check_subscription_active(self, org_id: UUID):
        """Blocks room creation if the org's subscription is expired or canceled."""
        stmt = select(Subscription).where(Subscription.org_id == org_id)
        result = await self.db.execute(stmt)
        sub = result.scalar_one_or_none()

        if not sub:
            # No subscription on record — treat as expired
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "SUBSCRIPTION_REQUIRED",
                    "message": "An active subscription is required to create rooms."
                }
            )

        now = datetime.now(timezone.utc)
        period_end = sub.current_period_end
        if period_end is not None and period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=timezone.utc)

        is_inactive = sub.status in ("past_due", "canceled", "unpaid")
        # For 'active' subscriptions trust the PayPal status — period_end may lag
        # behind the webhook. Only enforce period_end for non-active statuses.
        is_period_expired = (period_end is not None and period_end < now)
        is_expired = is_period_expired and sub.status not in ("active",)

        if is_expired or is_inactive:
            logger.warning(
                f"Org {org_id} subscription blocked: status={sub.status} "
                f"period_end={sub.current_period_end}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "SUBSCRIPTION_EXPIRED",
                    "message": "Your subscription has expired. Please renew to create new rooms."
                }
            )

        return True

    async def check_usage_quota(self, org_id: UUID):
        """Checks if organization has reached its monthly translation minute limit."""
        limits = await self.get_org_limits(org_id)
        max_minutes = limits["max_minutes"]

        # Sum minutes for current month
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        stmt = select(func.sum(UsageRecord.minutes_used)).where(
            UsageRecord.org_id == org_id,
            UsageRecord.recorded_at >= month_start
        )
        result = await self.db.execute(stmt)
        total_used = result.scalar() or 0

        if total_used >= max_minutes:
            logger.warning(f"Org {org_id} reached usage quota ({total_used}/{max_minutes} min)")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "QUOTA_EXCEEDED",
                    "type": "usage_limit",
                    "limit": max_minutes,
                    "current": float(total_used),
                    "message": f"Resource quota exceeded: Monthly translation limit of {max_minutes} minutes reached."
                }
            )
        
        return True
