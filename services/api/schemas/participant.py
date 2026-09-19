from pydantic import BaseModel, ConfigDict
from uuid import UUID
from typing import Optional
from datetime import datetime

class ParticipantResponse(BaseModel):
    id: UUID
    room_id: UUID
    user_id: Optional[UUID] = None
    identity: str
    display_name: str
    role: str
    joined_at: datetime
    left_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
