from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.schemas.lobby import JoinRequestCreate, JoinRequestResponse, JoinRequestUpdate
from app.models.models import JoinRequest, Room, User
from app.api.deps import get_current_user, ScopeChecker
from typing import List
from uuid import UUID
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post(
    "/{room_id}/lobby/request",
    response_model=JoinRequestResponse,
    summary="Guest Request to Join",
    description="Submit a request to join a room's waiting list."
)
async def request_join(
    room_id: UUID,
    request_in: JoinRequestCreate,
    db: AsyncSession = Depends(get_db)
):
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    join_request = JoinRequest(
        room_id=room_id,
        identity=request_in.identity,
        status="pending"
    )
    db.add(join_request)
    await db.commit()
    await db.refresh(join_request)
    return join_request

@router.get(
    "/{room_id}/lobby/status/{request_id}",
    response_model=JoinRequestResponse,
    summary="Check Request Status",
    description="Guest polls this endpoint to check if their join request has been approved."
)
async def check_request_status(
    room_id: UUID,
    request_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(JoinRequest).where(JoinRequest.id == request_id, JoinRequest.room_id == room_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return request

@router.get(
    "/{room_id}/lobby/pending",
    response_model=List[JoinRequestResponse],
    summary="List Pending Requests",
    description="Host retrieves a list of all pending join requests for the room."
)
async def list_pending_requests(
    room_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db)
):
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Moderator access required")
        
    result = await db.execute(
        select(JoinRequest).where(JoinRequest.room_id == room_id, JoinRequest.status == "pending")
    )
    return result.scalars().all()

@router.patch(
    "/{room_id}/lobby/approve/{request_id}",
    response_model=JoinRequestResponse,
    summary="Approve/Deny Join Request"
)
async def handle_join_request(
    room_id: UUID,
    request_id: UUID,
    update: JoinRequestUpdate,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db)
):
    room = (await db.execute(select(Room).where(Room.id == room_id))).scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Moderator access required")
        
    result = await db.execute(
        select(JoinRequest).where(JoinRequest.id == request_id, JoinRequest.room_id == room_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
        
    request.status = update.status
    await db.commit()
    await db.refresh(request)
    return request
