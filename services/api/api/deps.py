from typing import List, Optional
from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from redis.asyncio import Redis

from app.core import security
from app.core.database import get_db
from app.models.models import User, OrgMember
from app.core.config import settings
from app.core.redis import get_redis

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/token"
)

async def get_current_user(
    db: AsyncSession = Depends(get_db), 
    redis: Redis = Depends(get_redis),
    token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = security.decode_token(token)
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        if user_id is None or jti is None:
            raise credentials_exception
            
        # Section 7.1 JWT Revocation Check (Algorithmic safety)
        is_revoked = await redis.get(f"token_revoked:{jti}")
        if is_revoked:
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )
            
    except JWTError:
        raise credentials_exception
        
    # Section 7.1: Robust Identity Handling (Guest vs User)
    from uuid import UUID
    is_valid_uuid = False
    try:
        UUID(str(user_id))
        is_valid_uuid = True
    except (ValueError, TypeError):
        is_valid_uuid = False

    if is_valid_uuid:
        result = await db.execute(select(User).where(User.id == UUID(str(user_id))))
        user = result.scalar_one_or_none()
    else:
        # Check if this is a participant/guest from an invite
        if "participant" in payload.get("roles", []):
            # Return a "Virtual" User object for downstream scope checks
            # We don't commit this to DB.
            import re
            raw_sub = str(payload.get('sub', 'anonymous'))
            sanitized_sub = re.sub(r'[^a-zA-Z0-9\-_]', '_', raw_sub)
            user = User(
                id=UUID('00000000-0000-0000-0000-000000000000'), 
                email=f"guest_{sanitized_sub}@guest.aytme",
                full_name=raw_sub, 
                role="participant",
                is_active=True
            )
            # Inject scopes and room restriction since it's not from DB
            user.scopes = ["room:read", "room:write"] # Grant 'room:write' scope to participants
            user.room_id = payload.get("room_id") # Extract room_id from JWT
            return user
        user = None
    
    if user is None:
        raise credentials_exception
        
    # Inject scopes into user object for downstream use
    scopes = payload.get("scopes")
    if scopes is None:
        # Fallback for old tokens
        from app.core.security import ROLE_SCOPES
        roles = payload.get("roles", [])
        scopes = []
        for role in roles:
            scopes.extend(ROLE_SCOPES.get(role, []))

    user.scopes = list(set(scopes))

    # If this user's email is in the platform admin allowlist, guarantee they always
    # carry admin:all — regardless of what role the DB row or JWT currently holds.
    # This means ADMIN_EMAILS is the single authoritative source of admin access;
    # no DB role update required for allowlisted accounts.
    allowlist = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
    if allowlist and user.email.lower() in allowlist:
        from app.core.security import ROLE_SCOPES
        admin_scopes = ROLE_SCOPES.get("admin", [])
        user.scopes = list(set(user.scopes) | set(admin_scopes))

    return user

class ScopeChecker:
    """Enforces granular scopes (Section 7.1 RBAC System)"""
    def __init__(self, required_scopes: List[str]):
        self.required_scopes = required_scopes

    def __call__(self, current_user: User = Depends(get_current_user)):
        # For admin:all endpoints, the email allowlist is the authoritative gate.
        # Check it first — before scope check — so that any email in ADMIN_EMAILS
        # gets through regardless of what role their DB row or JWT currently carries.
        # (Previously the scope check ran first and blocked allowlisted emails
        #  whose DB role was not yet set to 'admin'.)
        if "admin:all" in self.required_scopes:
            allowlist = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
            if allowlist:
                if current_user.email.lower() in allowlist:
                    return current_user  # email is authoritative — no scope check needed
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access restricted",
                )

        # Non-admin:all scopes — enforce JWT scope check normally
        if not all(scope in current_user.scopes for scope in self.required_scopes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scopes: {self.required_scopes}",
            )
        return current_user

async def get_current_user_with_org(
    org_id: UUID,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
) -> dict:
    """Gets the user and their specific role within an organization."""
    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id, 
            OrgMember.user_id == current_user.id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this organization"
        )
    return {"user": current_user, "role": member.role}
