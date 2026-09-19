from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.core.database import get_db
from app.core.config import settings
from app.models.models import User, Room
from app.schemas.invitation import InviteTokenCreate, InviteTokenResponse
from app.services.invitation_service import InvitationService
from app.api.deps import get_current_user, ScopeChecker

router = APIRouter()

@router.post(
    "/{room_id}/invite",
    response_model=InviteTokenResponse,
    summary="Create Room Invite Link",
    description="""
Generate a time-limited, single-use (or multi-use) invite link for a room.

Recipients can join the room as a guest using `GET /api/v1/invitations/join/{token}`
**without** needing to create an account.

**React Integration Example:**

```javascript
// Generate and copy invite link
const createInvite = async (roomId, token) => {
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const res = await fetch(`/api/v1/invitations/${roomId}/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ max_uses: 10, expires_at: expiresAt })
  });
  const { token: inviteToken } = await res.json();
    const link = `${window.location.origin}/invite/${inviteToken}`;
  await navigator.clipboard.writeText(link);
  return link;
};
```
    """,
    responses={
        200: {"description": "Invite token created"},
        403: {"description": "Not authorized — must be room owner or admin"},
        404: {"description": "Room not found"},
    }
)
async def create_room_invite(
    room_id: UUID,
    invite_in: InviteTokenCreate,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db)
):
    # Check if user owns the room or is admin
    from app.services.room_service import RoomService
    room_service = RoomService(db, redis=None)
    room = await room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to invite to this room")

    service = InvitationService(db)
    return await service.create_invite(
        room_id=room_id,
        role=invite_in.role,
        max_uses=invite_in.max_uses,
        expires_at=invite_in.expires_at
    )


@router.get(
    "/validate/{token}",
    response_model=InviteTokenResponse,
    summary="Validate Invite Token",
    description="""
Validate an invite token before attempting to join.

Use this to pre-check if a token is valid and not expired before showing the join UI.

**React Integration Example:**

```javascript
// Validate token on page load (e.g. /join/:token)
useEffect(() => {
  fetch(`/api/v1/invitations/validate/${token}`)
    .then(r => { if (!r.ok) throw new Error('Invalid invite'); return r.json(); })
    .then(data => setInvite(data))
    .catch(() => setError('This invite link is invalid or has expired.'));
}, [token]);
```
    """,
    responses={
        200: {"description": "Token is valid — returns invite details"},
        400: {"description": "Token is invalid or expired"},
    }
)
async def validate_invite(token: str, db: AsyncSession = Depends(get_db)):
    service = InvitationService(db)
    invite = await service.validate_invite(token)
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")
        
    # Fetch room to get its approval policy
    room = (await db.execute(select(Room).where(Room.id == invite.room_id))).scalar_one_or_none()
    
    # Manually construct response to include extra field if needed, 
    # but Pydantic's from_attributes handles it if the object has the attribute.
    # Since 'Room' has 'requires_approval' and 'InviteToken' doesn't, we can attach it temporarily.
    invite_dict = {
        "id": invite.id,
        "room_id": invite.room_id,
        "token": invite.token,
        "role": invite.role,
        "max_uses": invite.max_uses,
        "use_count": invite.use_count,
        "expires_at": invite.expires_at,
        "created_at": invite.created_at,
        "requires_approval": room.requires_approval if room else False,
        "room_name": room.name if room else None,
        "owner_id": room.owner_id if room else None,
        "mode": room.mode if room else None,
        "primary_lang": room.primary_lang if room else None,
        "secondary_lang": room.secondary_lang if room else None,
    }
    return invite_dict


@router.post(
    "/join/{token}",
    summary="Join Room via Invite",
    description="""
Join a room as a guest using an invite token.

**No account required.** Returns a LiveKit token and a temporary JWT that grants
guest-level access to the room for the duration of the session.

**React Integration Example:**

```javascript
// JoinRoom.jsx — Guest join flow
const joinAsGuest = async (token, displayName) => {
  const res = await fetch(
    `/api/v1/invitations/join/${token}?display_name=${encodeURIComponent(displayName)}`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error('Failed to join room');
  const { token: livekitToken, access_token, livekit_url } = await res.json();

  // Store the guest access_token for subsequent API calls
  localStorage.setItem('token', access_token);

  // Connect to LiveKit with livekitToken
  await room.connect(livekit_url, livekitToken);
};
```
    """,
    responses={
        200: {"description": "Joined — returns LiveKit token + guest access token"},
        400: {"description": "Invalid or expired invite token"},
        404: {"description": "Room not found"},
    }
)
async def join_room_via_invite(
    token: str, 
    display_name: str,
    db: AsyncSession = Depends(get_db)
):
    service = InvitationService(db)
    invite = await service.validate_invite(token)
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")
    
    from app.services.room_service import RoomService
    room_service = RoomService(db, redis=None)
    room = await room_service.get_room(invite.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    await service.use_invite(invite)

    import re
    from uuid import uuid4
    from app.core.livekit import livekit_manager
    # Use a clean identity with a random suffix to prevent session clashes
    # Sanitize: remove spaces and non-alphanumeric except for - and _
    sanitized_name = re.sub(r'[^a-zA-Z0-9\-_]', '_', display_name)
    identity = f"{sanitized_name}_{uuid4().hex[:4]}"
    room_name = room.livekit_room_id or str(room.id)
    lk_token = livekit_manager.get_token(room_name, identity)
    
    from app.core.security import create_access_token
    access_token = create_access_token(
        subject=identity,
        roles=["participant"],
        room_id=room.id
    )
    
    return {
        "token": lk_token,
        "access_token": access_token,
        "room_id": room.id,
        "role": invite.role,
        "room_name": room.name,
        "mode": room.mode,
        "primary_lang": room.primary_lang,
        "secondary_lang": room.secondary_lang,
        "livekit_url": settings.LIVEKIT_URL
    }
