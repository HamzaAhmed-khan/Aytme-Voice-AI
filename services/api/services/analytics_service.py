from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.models import Room, UsageRecord, Organization
from uuid import UUID
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_dashboard_stats(self, org_id: UUID) -> Dict[str, Any]:
        """Get summarized stats for dashboard widgets."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # 1. Total rooms (All time for this org)
        total_rooms = await self.db.scalar(
            select(func.count(Room.id)).where(Room.org_id == org_id)
        ) or 0

        # 2. Active Today (Rooms created TODAY)
        active_rooms_today = await self.db.scalar(
            select(func.count(Room.id)).where(
                and_(
                    Room.org_id == org_id,
                    Room.created_at >= today_start
                )
            )
        ) or 0

        # 3. Minutes used this month
        minutes_used = await self.db.scalar(
            select(func.sum(UsageRecord.minutes_used)).where(
                and_(
                    UsageRecord.org_id == org_id,
                    UsageRecord.recorded_at >= month_start
                )
            )
        ) or 0.0

        # 4. Active Now (Rooms currently in 'active' status)
        active_now = await self.db.scalar(
            select(func.count(Room.id)).where(
                and_(
                    Room.org_id == org_id,
                    Room.status == 'active'
                )
            )
        ) or 0

        # 5. Top Mode Usage (Analytical proxy: most frequent source/target combination)
        top_mode_result = await self.db.execute(
            select(Room.source_lang, Room.target_langs, func.count(Room.id))
            .where(Room.org_id == org_id)
            .group_by(Room.source_lang, Room.target_langs)
            .order_by(func.count(Room.id).desc())
            .limit(1)
        )
        mode_row = top_mode_result.first()
        top_mode = "Standard"
        if mode_row:
            # Safely handle source_lang and target_langs
            source = (mode_row[0] or "EN").upper()
            # target_langs is a list
            targets = mode_row[1]
            target = targets[0].upper() if targets and isinstance(targets, list) else "AUTO"
            top_mode = f"{source} → {target}"

        return {
            "total_rooms": int(total_rooms),
            "active_rooms_today": int(active_rooms_today),
            "active_now": int(active_now),
            "minutes_used": float(minutes_used),
            "top_mode": top_mode,
            "last_updated": now.isoformat()
        }
