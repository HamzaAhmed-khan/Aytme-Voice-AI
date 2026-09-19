from pydantic import BaseModel, ConfigDict
from uuid import UUID
from typing import Optional, List
from datetime import datetime

class ApiTokenCreate(BaseModel):
    name: str
    scopes: List[str] = []

class ApiTokenResponse(BaseModel):
    id: UUID
    name: str
    scopes: List[str]
    last_used_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ApiTokenCreatedResponse(ApiTokenResponse):
    token: str # Only returned once upon creation
