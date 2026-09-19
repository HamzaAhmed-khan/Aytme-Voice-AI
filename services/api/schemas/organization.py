from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict

class OrganizationBase(BaseModel):
    name: str
    slug: str

class OrganizationCreate(OrganizationBase):
    pass

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    settings: Optional[dict] = None

class OrganizationResponse(OrganizationBase):
    id: UUID
    owner_id: UUID
    plan: str
    settings: dict
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class OrgMemberResponse(BaseModel):
    user_id: UUID
    role: str
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)

class OrgMemberDetailResponse(BaseModel):
    """Enriched member response with user details."""
    user_id: UUID
    email: str
    full_name: Optional[str] = None
    role: str
    joined_at: datetime
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)

class RoleResponse(BaseModel):
    """Static role definition."""
    name: str
    slug: str
    description: str
    permissions: Dict[str, bool]

class AddMemberRequest(BaseModel):
    """Request to add a member by email."""
    email: str
    role: str = "member"

class TransferOwnershipRequest(BaseModel):
    """Request to transfer org ownership."""
    new_owner_user_id: UUID
