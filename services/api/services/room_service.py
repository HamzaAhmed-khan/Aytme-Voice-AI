from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Room, Organization, AuditLog
from app.core.config import settings
from redis.asyncio import Redis
from datetime import datetime, timedelta, timezone
import json
import logging
import random
import string
import re

logger = logging.getLogger(__name__)

class RoomService:
    def __init__(self, db: AsyncSession, redis: Redis):
        self.db = db
        self.redis = redis

    async def _generate_unique_slug(self, name: str) -> str:
        """Generate a URL-friendly unique slug for a room."""
        base_slug = re.sub(r'[^a-z0-9]', '-', name.lower()).strip('-')
        if not base_slug:
            base_slug = 'room'
        
        while True:
            # Add a random suffix for uniqueness
            suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
            slug = f"{base_slug}-{suffix}"
            
            # Check if slug exists
            result = await self.db.execute(select(Room).where(Room.slug == slug))
            if result.scalar_one_or_none() is None:
                return slug

    async def create_room(
        self, 
        name: str, 
        owner_id: UUID, 
        mode: str = "conversation",
        org_id: UUID = None, 
        source_lang: str = "auto", 
        target_langs: list = None, 
        primary_lang: str = None, 
        secondary_lang: str = None, 
        available_langs: list = None,
        visibility: str = "private", 
        policy: dict = None,
        # Mode-specific fields
        device_session_id: str = None,
        mic_a_lang: str = None,
        mic_b_lang: str = None,
        broadcaster_id: UUID = None,
        default_lang: str = None
    ):
        # 1. Quota Enforcement
        from app.services.quota_service import QuotaService
        quota_service = QuotaService(self.db)
        if org_id:
            await quota_service.check_subscription_active(org_id)
            await quota_service.check_room_quota(org_id)
            await quota_service.check_usage_quota(org_id)

        # 2. Identifier logic
        # For talk_together, we don't necessarily NEED a LiveKit room as it's local,
        # but we'll generate one anyway for consistency in tracing, or leave it empty.
        livekit_room_id = str(uuid4()) if mode != "talk_together" else None
        
        # 3. Generate a unique slug for public joining
        slug = await self._generate_unique_slug(name)
        invite_token = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
        
        # 4. Language resolution (for AI modes)
        from app.core.language_utils import resolve_language_name
        
        resolved_primary = resolve_language_name(primary_lang) if primary_lang else None
        resolved_secondary = secondary_lang
        if resolved_secondary:
            resolved_secondary = resolve_language_name(resolved_secondary)
        elif target_langs and len(target_langs) > 0:
            resolved_secondary = resolve_language_name(target_langs[0])
            
        # 5. Model instantiation
        room = Room(
            name=name,
            slug=slug,
            mode=mode,
            owner_id=owner_id,
            org_id=org_id,
            livekit_room_id=livekit_room_id,
            source_lang=source_lang,
            target_langs=target_langs or [],
            primary_lang=resolved_primary,
            secondary_lang=resolved_secondary,
            available_langs=available_langs or [],
            broadcaster_id=broadcaster_id or (owner_id if mode == "broadcast" else None),
            default_lang=default_lang,
            device_session_id=device_session_id,
            mic_a_lang=mic_a_lang,
            mic_b_lang=mic_b_lang,
            invite_token=invite_token,
            visibility=visibility or "private",
            policy=policy or {},
            status="active" if mode == "talk_together" else "pending",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24) # DEFAULT expiry
        )
        self.db.add(room)
        
        # 6. Audit Log
        audit = AuditLog(
            actor_id=owner_id,
            actor_type="user",
            action="room_create",
            resource_type="room",
            resource_id=str(room.id),
            outcome="success",
            payload={"name": name, "mode": mode, "slug": slug, "lk_room": livekit_room_id}
        )
        self.db.add(audit)
        
        await self.db.commit()
        await self.db.refresh(room)
        
        return room

    async def get_room(self, room_id: UUID):
        result = await self.db.execute(select(Room).where(Room.id == room_id))
        return result.scalar_one_or_none()

    async def get_room_by_slug(self, slug: str):
        result = await self.db.execute(select(Room).where(Room.slug == slug))
        return result.scalar_one_or_none()

    async def update_room_policy(self, room_id: UUID, policy: dict):
        room = await self.get_room(room_id)
        if room:
            room.policy = policy
            await self.db.commit()
            await self.db.refresh(room)
        return room

    async def end_room(self, room_id: UUID):
        room = await self.get_room(room_id)
        if room:
            room.status = "ended"
            room.ended_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(room)
        return room

    async def delete_room(self, room_id: UUID):
        from sqlalchemy import delete
        try:
            await self.db.execute(delete(Room).where(Room.id == room_id))
            await self.db.commit()
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Failed to delete room {room_id}: {e}")
            raise

    async def cleanup_old_rooms(self, days: int = 30):
        from sqlalchemy import delete
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        try:
            result = await self.db.execute(
                delete(Room).where(Room.created_at < cutoff)
            )
            count = result.rowcount
            await self.db.commit()
            return count
        except Exception as e:
            await self.db.rollback()
            raise

    async def track_usage(self, room_id: UUID, duration_m: float):
        """Record partial session usage for billing."""
        from app.models.models import BillingEvent, UsageRecord
        room = await self.get_room(room_id)
        if not room or not room.org_id:
            return

        # 1. Billing Event Link
        event = BillingEvent(
            org_id=room.org_id,
            room_id=room_id,
            event_type="ai_translation_usage",
            quantity=duration_m,
            period_start=room.started_at or room.created_at,
            period_end=datetime.now(timezone.utc)
        )
        self.db.add(event)
        
        # 2. Usage Record (for quota enforcement)
        usage = UsageRecord(
            org_id=room.org_id,
            room_id=room_id,
            minutes_used=duration_m,
            recorded_at=datetime.now(timezone.utc)
        )
        self.db.add(usage)
        
        await self.db.commit()
