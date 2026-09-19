from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import datetime
from typing import List, Optional, Literal
from enum import Enum

class VisibilityEnum(str, Enum):
    public = "public"
    private = "private"

class RoomMode(str, Enum):
    conversation = "conversation"
    talk_together = "talk_together"
    broadcast = "broadcast"

class RoomBase(BaseModel):
    name: str 
    mode: RoomMode = RoomMode.conversation
    source_lang: Optional[str] = "auto"
    target_langs: Optional[List[str]] = []
    primary_lang: Optional[str] = None
    secondary_lang: Optional[str] = None
    visibility: Optional[VisibilityEnum] = VisibilityEnum.private

class RoomCreate(RoomBase):
    org_id: Optional[UUID] = None
    available_langs: Optional[List[str]] = []
    policy: Optional[dict] = {}
    max_participants: Optional[int] = 50
    # Additional fields for specific modes
    device_session_id: Optional[str] = None
    mic_a_lang: Optional[str] = None
    mic_b_lang: Optional[str] = None
    broadcaster_id: Optional[UUID] = None

class BotStartRequest(BaseModel):
    primary_lang: Optional[str] = None
    secondary_lang: Optional[str] = None
    available_langs: Optional[List[str]] = []

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    visibility: Optional[VisibilityEnum] = None
    source_lang: Optional[str] = None
    target_langs: Optional[List[str]] = None
    primary_lang: Optional[str] = None
    secondary_lang: Optional[str] = None
    available_langs: Optional[List[str]] = None
    device_session_id: Optional[str] = None
    mic_a_lang: Optional[str] = None
    mic_b_lang: Optional[str] = None
    broadcaster_id: Optional[UUID] = None
    policy: Optional[dict] = None

class RoomModeUpdate(BaseModel):
    mode: RoomMode = RoomMode.conversation
    tts_enabled: Optional[bool] = None

class RoomResponse(RoomBase):
    id: UUID
    owner_id: Optional[UUID] = None
    slug: Optional[str] = None
    invite_token: Optional[str] = None
    livekit_room_id: Optional[str] = None
    status: str
    available_langs: Optional[List[str]] = []
    policy: Optional[dict] = {}
    
    # Mode-specific data in response
    broadcaster_id: Optional[UUID] = None
    device_session_id: Optional[str] = None
    mic_a_lang: Optional[str] = None
    mic_b_lang: Optional[str] = None

    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
