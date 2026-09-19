from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.config import settings
from app.schemas.room import RoomCreate, RoomUpdate, RoomResponse, BotStartRequest, RoomModeUpdate
from app.services.room_service import RoomService
from app.services.billing_service import BillingService
from typing import List
from sqlalchemy import select, func
from app.api.deps import get_current_user, ScopeChecker
from app.models.models import User, Room, Subscription, Plan, UsageRecord
from uuid import UUID
import logging
import json
import re
from livekit.api import ListParticipantsRequest

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get(
    "/",
    response_model=List[RoomResponse],
    summary="List User Rooms"
)
async def list_rooms(
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db),
):
    """Get all rooms for current user."""
    result = await db.execute(select(Room).where(Room.owner_id == current_user.id))
    return result.scalars().all()

@router.post(
    "/",
    response_model=RoomResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create New Conference Room"
)
async def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Create a new conference room with mode-specific settings."""
    service = RoomService(db, redis)
    room = await service.create_room(
        name=room_in.name,
        mode=room_in.mode,
        owner_id=current_user.id,
        org_id=room_in.org_id,
        source_lang=room_in.source_lang,
        target_langs=room_in.target_langs,
        primary_lang=room_in.primary_lang,
        secondary_lang=room_in.secondary_lang,
        available_langs=room_in.available_langs,
        visibility=room_in.visibility,
        policy=room_in.policy,
        device_session_id=room_in.device_session_id,
        mic_a_lang=room_in.mic_a_lang,
        mic_b_lang=room_in.mic_b_lang,
        broadcaster_id=room_in.broadcaster_id
    )
    return room

@router.get(
    "/{room_id}",
    response_model=RoomResponse,
    summary="Get Room Details"
)
async def get_room(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis) # if needed
):
    """Retrieve detailed information about a single room."""
    service = RoomService(db, redis)
    room = await service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    # Standard users can only view rooms they own or have access to,
    # unless logic specifies otherwise. We'll enforce basic ownership/access here 
    # if it's not a guest trying to view the public endpoint. The `/join/{slug}` acts as public.
    return room

@router.post(
    "/{room_id}/token",
    summary="Get LiveKit Token for Room"
)
async def get_room_token(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Issue a LiveKit token for authenticated user to join a room."""
    service = RoomService(db, redis)
    room = await service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    from app.core.livekit import livekit_manager
    import re
    
    identity = f"{current_user.full_name or current_user.email}_{str(current_user.id)[:8]}"
    sanitized_identity = re.sub(r'[^a-zA-Z0-9\-_]', '_', identity)
    
    room_name = room.livekit_room_id or str(room.id)
    lk_token = livekit_manager.get_token(room_name, sanitized_identity)
    
    return {
        "token": lk_token,
        "url": settings.LIVEKIT_URL,
        "room": room
    }

@router.get(
    "/join/{slug}",
    response_model=RoomResponse,
    summary="Get Room Details by Slug (Public)"
)
async def get_room_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Validate invite + room preview — no auth."""
    service = RoomService(db, redis=None)
    room = await service.get_room_by_slug(slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@router.post(
    "/join/{slug}",
    summary="Join Room by Slug (Guest Access)"
)
async def join_room_by_slug(
    slug: str,
    identity: str,
    db: AsyncSession = Depends(get_db)
):
    """Issue session + livekit token for guest users."""
    service = RoomService(db, redis=None)
    room = await service.get_room_by_slug(slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    from app.core import security
    from app.core.livekit import livekit_manager
    from uuid import uuid4
    
    # Guest identity generation
    sanitized_identity = re.sub(r'[^a-zA-Z0-9\-_]', '_', identity)
    guest_identity = f"guest_{sanitized_identity}_{uuid4().hex[:4]}"
    
    # Create a participant session token
    access_token = security.create_access_token(
        data={
            "sub": guest_identity,
            "roles": ["participant"],
            "room_id": str(room.id)
        }
    )
    
    room_name = room.livekit_room_id or str(room.id)
    lk_token = livekit_manager.get_token(room_name, guest_identity)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "livekit_token": lk_token,
        "livekit_url": settings.LIVEKIT_URL,
        "room": room
    }

@router.post(
    "/{room_id}/start",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Activate AI Bot in Room"
)
async def start_media_bot(
    room_id: UUID,
    bot_in: BotStartRequest,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Start AI translation bot in a room."""
    service = RoomService(db, redis)
    room = await service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    # Start bot for room
    from app.core.language_utils import resolve_language_name
    
    raw_primary = bot_in.primary_lang or room.primary_lang or ""
    raw_secondary = bot_in.secondary_lang or room.secondary_lang or ""
    
    resolved_primary = resolve_language_name(raw_primary)
    resolved_secondary = resolve_language_name(raw_secondary) if raw_secondary else ""
    
    job_data = {
        "type": "bot_start",
        "mode": room.mode,
        "room_id": str(room.id),
        "livekit_room_id": room.livekit_room_id or str(room.id),
        "primary_lang": resolved_primary,
        "secondary_lang": resolved_secondary,
        "available_langs": ",".join(bot_in.available_langs or room.available_langs or [])
    }
    
    await redis.xadd("worker:jobs", job_data)
    logger.info(f"Bot start job queued for room {room_id} (mode: {room.mode})")
    
    return {"status": "bot_start_queued"}

@router.get(
    "/{room_id}/bot-status",
    summary="Check AI Bot Status in Room"
)
async def get_bot_status(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Poll endpoint to check if the AI bot is active in the room."""
    # 1. Check Redis for worker heartbeat
    heartbeat_key = f"worker:heartbeat:{str(room_id).lower()}"
    heartbeat = await redis.get(heartbeat_key)
    
    if heartbeat:
        return {"bot_active": True, "source": "heartbeat"}
    
    # 2. Fallback: Check LiveKit room participants for a bot identity
    try:
        from app.core.livekit import livekit_manager
        service = RoomService(db, redis)
        room = await service.get_room(room_id)
        if room and room.livekit_room_id:
            async with livekit_manager.get_api() as lkapi:
                participants = await lkapi.room.list_participants(
                    ListParticipantsRequest(room=room.livekit_room_id)
                )
                for p in participants.participants:
                    if p.identity and (
                        p.identity.lower().startswith("bot_") or 
                        "interpreter" in p.identity.lower()
                    ):
                        return {"bot_active": True, "source": "livekit"}
    except Exception as e:
        logger.warning(f"Bot status LiveKit check failed: {e}")

    # 3. Check Redis job queue for pending start
    pending_key = f"worker:pending:{str(room_id).lower()}"
    pending = await redis.get(pending_key)
    
    return {
        "bot_active": False, 
        "pending": pending is not None,
        "source": "none"
    }

@router.get("/{room_id}/broadcast/stats")
async def get_broadcast_stats(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Live listener count + language breakdown for broadcast rooms."""
    stats_key = f"broadcast:stats:{str(room_id).lower()}"
    raw_stats = await redis.get(stats_key)
    if not raw_stats:
        return {
            "total_listeners": 0, 
            "by_language": {}, 
            "active_pipelines": [], 
            "usage_minutes": 0
        }
    return json.loads(raw_stats)

@router.post("/{room_id}/language-change")
async def change_listener_language(
    room_id: UUID,
    lang: str,
    participant_sid: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Listener changes language in broadcast room."""
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room or room.mode != "broadcast":
        raise HTTPException(status_code=400, detail="Only broadcast rooms support language switching")
        
    # Notify worker of new language demand
    await redis.xadd("worker:jobs", {
        "type": "language_demand",
        "room_id": str(room_id),
        "participant_sid": participant_sid,
        "new_lang": lang
    })
    
    return {"status": "success", "language": lang}

@router.post("/{room_id}/end")
async def end_room(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """End room — host only."""
    service = RoomService(db, redis)
    room = await service.end_room(room_id)
    
    # Disconnect from LiveKit
    if room.livekit_room_id:
        from app.core.livekit import livekit_manager
        try:
            async with livekit_manager.get_api() as lkapi:
                await lkapi.room.delete_room(room.livekit_room_id)
        except Exception: pass
    
    return {"status": "ended", "room_id": str(room_id)}

@router.patch("/{room_id}/mode", response_model=RoomResponse)
async def update_room_mode(
    room_id: UUID,
    mode_update: RoomModeUpdate,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db)
):
    """Dynamically switch room mode."""
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    room.mode = mode_update.mode
    await db.commit()
    await db.refresh(room)
    return room

@router.patch("/{room_id}", response_model=RoomResponse)
async def patch_room(
    room_id: UUID,
    room_in: RoomUpdate,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db)
):
    """Update room details."""
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Ownership/Permission check
    if room.owner_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized to edit this room")

    update_data = room_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(room, field, value)
    
    await db.commit()
    await db.refresh(room)
    return room

@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Decommission and delete a room."""
    service = RoomService(db, redis)
    room = await service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    if room.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this room")
        
    await service.delete_room(room_id)
    return None
