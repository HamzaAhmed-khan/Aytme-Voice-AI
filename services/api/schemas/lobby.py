from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional

class JoinRequestCreate(BaseModel):
    identity: str

class JoinRequestResponse(BaseModel):
    id: UUID
    room_id: UUID
    identity: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class JoinRequestUpdate(BaseModel):
    status: str # approved, denied
