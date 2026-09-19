from pydantic import BaseModel, ConfigDict
from uuid import UUID
from typing import Optional
from datetime import datetime

class TranscriptResponse(BaseModel):
    id: UUID
    room_id: UUID
    participant_id: Optional[UUID] = None
    speaker_identity: Optional[str] = None
    is_ai: bool = False
    source_lang: str
    target_lang: str
    text_raw: str
    text_translated: Optional[str] = None
    confidence: Optional[float] = None
    start_ms: int
    end_ms: int
    is_final: bool = True
    session_id: Optional[UUID] = None
    tts_duration_ms: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
