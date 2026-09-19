from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.schemas.participant import ParticipantResponse
from app.api.deps import get_current_user, ScopeChecker
from app.models.models import User, Participant, Room
from typing import List
from uuid import UUID

router = APIRouter()

@router.get(
    "/{room_id}/participants",
    response_model=List[ParticipantResponse],
    summary="List Room Participants",
    description="""
Get all participants who have joined this room, ordered by join time (newest first).

**React Integration Example:**

```javascript
const fetchParticipants = async (roomId, token) => {
  const res = await fetch(`/api/v1/rooms/${roomId}/participants`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return await res.json();
};
```
    """,
    responses={
        200: {"description": "List of participants"},
        403: {"description": "Access denied — not room owner or admin"},
    }
)
async def list_participants(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db)
):
    room_result = await db.execute(select(Room).where(Room.id == room_id))
    room = room_result.scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role not in ["admin", "worker"]):
        raise HTTPException(status_code=403, detail="Access denied to this room")

    query = select(Participant).where(Participant.room_id == room_id).order_by(Participant.joined_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


def _assert_moderator(room: Room, current_user: User):
    """Check that current_user is room owner or system admin."""
    if room.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Moderator access required")


@router.post(
    "/{room_id}/participants/{participant_id}/mute",
    tags=["participants"],
    summary="Mute Participant",
    description="Moderator sets the participant's `is_muted` flag to `true`. The AI bot enforces muting via polling.",
    responses={
        200: {"description": "Participant muted"},
        403: {"description": "Moderator access required"},
        404: {"description": "Room or participant not found"},
    }
)
async def mute_participant(
    room_id: UUID,
    participant_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Moderator mutes a participant (sets is_muted flag in DB; LiveKit enforcement via bot polling)."""
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    _assert_moderator(room, current_user)

    participant = (await db.execute(
        select(Participant).where(Participant.id == participant_id, Participant.room_id == room_id)
    )).scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.is_muted = True
    await db.commit()
    return {"status": "muted", "participant_id": str(participant_id)}


@router.post(
    "/{room_id}/participants/{participant_id}/unmute",
    tags=["participants"],
    summary="Unmute Participant",
    description="Moderator sets the participant's `is_muted` flag to `false`, restoring their audio.",
    responses={
        200: {"description": "Participant unmuted"},
        403: {"description": "Moderator access required"},
        404: {"description": "Room or participant not found"},
    }
)
async def unmute_participant(
    room_id: UUID,
    participant_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    _assert_moderator(room, current_user)

    participant = (await db.execute(
        select(Participant).where(Participant.id == participant_id, Participant.room_id == room_id)
    )).scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.is_muted = False
    await db.commit()
    return {"status": "unmuted", "participant_id": str(participant_id)}


@router.delete(
    "/{room_id}/participants/{participant_id}",
    tags=["participants"],
    summary="Remove (Kick) Participant",
    description="Moderator removes a participant from the room. The room owner cannot be kicked.",
    responses={
        200: {"description": "Participant removed"},
        403: {"description": "Moderator access required or cannot remove owner"},
        404: {"description": "Room or participant not found"},
    }
)
async def remove_participant(
    room_id: UUID,
    participant_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Moderator removes (kicks) a participant from the room."""
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    _assert_moderator(room, current_user)

    participant = (await db.execute(
        select(Participant).where(Participant.id == participant_id, Participant.room_id == room_id)
    )).scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Protect the room owner from being kicked
    if hasattr(participant, 'user_id') and participant.user_id == room.owner_id:
        raise HTTPException(status_code=403, detail="Cannot remove the room owner")

    await db.delete(participant)
    await db.commit()
    return {"status": "removed", "participant_id": str(participant_id)}


@router.patch(
    "/{room_id}/participants/{participant_id}/promote",
    tags=["participants"],
    summary="Promote Participant Role",
    description="""
Change a participant's in-room role. Valid roles: `speaker`, `moderator`, `listener`.

**React Integration Example:**

```javascript
const promoteParticipant = async (roomId, participantId, newRole, token) => {
  const res = await fetch(
    `/api/v1/rooms/${roomId}/participants/${participantId}/promote?new_role=${newRole}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }
  );
  return await res.json();
};
```
    """,
    responses={
        200: {"description": "Role updated"},
        400: {"description": "Invalid role value"},
        403: {"description": "Moderator access required"},
        404: {"description": "Room or participant not found"},
    }
)
async def promote_participant(
    room_id: UUID,
    participant_id: UUID,
    new_role: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Promote a participant to moderator or speaker role."""
    valid_roles = ["speaker", "moderator", "listener"]
    if new_role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")

    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    _assert_moderator(room, current_user)

    participant = (await db.execute(
        select(Participant).where(Participant.id == participant_id, Participant.room_id == room_id)
    )).scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.role = new_role
    await db.commit()
    return {"status": "promoted", "participant_id": str(participant_id), "new_role": new_role}
