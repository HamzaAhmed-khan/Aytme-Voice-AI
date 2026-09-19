from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import InviteToken, Room
from uuid import UUID, uuid4
from datetime import datetime
import secrets

class InvitationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_invite(self, room_id: UUID, role: str, max_uses: int = 1, expires_at: datetime = None) -> InviteToken:
        token = secrets.token_urlsafe(16)
        invite = InviteToken(
            room_id=room_id,
            token=token,
            role=role,
            max_uses=max_uses,
            expires_at=expires_at
        )
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def validate_invite(self, token: str) -> InviteToken:
        from datetime import timezone
        stmt = select(InviteToken).where(InviteToken.token == token)
        result = await self.db.execute(stmt)
        invite = result.scalars().first()

        if not invite:
            print(f"[Invitation] Token not found: {token}")
            return None
        
        now = datetime.now(timezone.utc)
        if invite.expires_at:
            # Ensure invite.expires_at is timezone-aware if it's not
            expires = invite.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            
            if expires < now:
                print(f"[Invitation] Token expired: {token} (Expires: {expires}, Now: {now})")
                return None
        
        if invite.use_count >= invite.max_uses:
            print(f"[Invitation] Token max uses reached: {token} ({invite.use_count}/{invite.max_uses})")
            return None
        
        return invite

    async def use_invite(self, invite: InviteToken):
        invite.use_count += 1
        await self.db.commit()
        await self.db.refresh(invite)
