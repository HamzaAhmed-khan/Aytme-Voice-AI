from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional

class InviteTokenCreate(BaseModel):
    role: str = "listener"
    max_uses: int = 1
    expires_at: Optional[datetime] = None

class InviteTokenResponse(BaseModel):
    id: UUID
    room_id: UUID
    token: str
    role: str
    max_uses: int
    use_count: int
    expires_at: Optional[datetime]
    created_at: datetime
    requires_approval: bool = False
    room_name: Optional[str] = None
    owner_id: Optional[UUID] = None
    mode: Optional[str] = None
    primary_lang: Optional[str] = None
    secondary_lang: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
