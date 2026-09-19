from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from uuid import UUID
from app.core.database import get_db
from app.models.models import User, OrgMember, AuditLog
from app.api.deps import get_current_user
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class AuditLogResponse(BaseModel):
    id: UUID
    action: str
    actor_id: UUID
    actor_name: Optional[str]
    actor_type: str
    resource_type: str
    resource_id: str
    outcome: str
    payload: dict
    timestamp: datetime

    class Config:
        from_attributes = True

@router.get(
    "/{org_id}",
    response_model=List[AuditLogResponse],
    summary="Get Organization Audit Logs"
)
async def get_org_audit_logs(
    org_id: UUID,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve audit logs for a specific organization.
    Requires 'admin' or 'owner' role in the organization.
    """
    # Check membership and role
    stmt = select(OrgMember).where(
        OrgMember.org_id == org_id, 
        OrgMember.user_id == current_user.id
    )
    member = (await db.execute(stmt)).scalars().first()
    
    if not member or member.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Insufficient permissions to view audit logs"
        )

    # Fetch logs with actor name
    stmt = select(AuditLog, User.full_name.label("actor_name")).outerjoin(
        User, AuditLog.actor_id == User.id
    ).where(
        AuditLog.org_id == org_id
    ).order_by(desc(AuditLog.created_at)).limit(limit).offset(offset)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    logs = []
    for log, actor_name in rows:
        logs.append(AuditLogResponse(
            id=log.id,
            action=log.action,
            actor_id=log.actor_id,
            actor_name=actor_name or "System",
            actor_type=log.actor_type,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            outcome=log.outcome,
            payload=log.payload,
            timestamp=log.created_at
        ))
    
    return logs
