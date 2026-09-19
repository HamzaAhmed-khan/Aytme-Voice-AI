from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
from uuid import UUID
from typing import Optional, Literal

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: UUID
    role: str
    
    @field_validator('role', mode='before')
    @classmethod
    def validate_role(cls, v: str) -> str:
        if isinstance(v, str):
            v_lower = v.lower().strip()
            allowed = ["admin", "owner", "member", "worker", "participant", "user"]
            if v_lower in allowed:
                return v_lower
        return v

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    # Can add other preferences here
