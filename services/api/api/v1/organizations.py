from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.utils.audit import log_event
from app.models.models import User, Organization, OrgMember, Subscription
from app.services.analytics_service import AnalyticsService
from app.schemas.organization import (
    OrganizationCreate, OrganizationResponse, OrganizationUpdate, OrgMemberResponse,
    OrgMemberDetailResponse, RoleResponse, AddMemberRequest, TransferOwnershipRequest
)
from app.api.deps import get_current_user, ScopeChecker
import logging

logger = logging.getLogger(__name__)

# ── Static role definitions ──────────────────────────────────────
BUILT_IN_ROLES = [
    {
        "name": "Owner", "slug": "owner",
        "description": "Full control over the organization, billing, and all settings.",
        "permissions": {
            "create_rooms": True, "manage_members": True, "billing_access": True,
            "start_ai_agent": True, "view_transcripts": True, "join_rooms": True,
            "transfer_ownership": True,
        },
    },
    {
        "name": "Admin", "slug": "admin",
        "description": "Can manage members, billing, and create rooms.",
        "permissions": {
            "create_rooms": True, "manage_members": True, "billing_access": True,
            "start_ai_agent": True, "view_transcripts": True, "join_rooms": True,
            "transfer_ownership": False,
        },
    },
    {
        "name": "Manager", "slug": "manager",
        "description": "Can create rooms and start AI agents but cannot manage billing.",
        "permissions": {
            "create_rooms": True, "manage_members": False, "billing_access": False,
            "start_ai_agent": True, "view_transcripts": True, "join_rooms": True,
            "transfer_ownership": False,
        },
    },
    {
        "name": "Member", "slug": "member",
        "description": "Can join rooms and use the AI agent. Default role for new members.",
        "permissions": {
            "create_rooms": False, "manage_members": False, "billing_access": False,
            "start_ai_agent": True, "view_transcripts": True, "join_rooms": True,
            "transfer_ownership": False,
        },
    },
    {
        "name": "Viewer", "slug": "viewer",
        "description": "Read-only access. Can view transcripts but cannot start AI or create rooms.",
        "permissions": {
            "create_rooms": False, "manage_members": False, "billing_access": False,
            "start_ai_agent": False, "view_transcripts": True, "join_rooms": False,
            "transfer_ownership": False,
        },
    },
]

router = APIRouter()

@router.get(
    "/",
    response_model=List[OrganizationResponse],
    summary="List User Organizations",
    responses={
        200: {"description": "Organizations retrieved"}
    }
)
async def list_organizations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    r"""
    List all organizations the current user belongs to.
    
    **React Integration Example:**
    
    ```javascript
    // hooks/useOrganizations.js
    import { useState, useEffect } from 'react';
    
    export function useOrganizations(token) {
      const [orgs, setOrgs] = useState([]);
      const [loading, setLoading] = useState(true);
      
      useEffect(() => {
        const fetchOrgs = async () => {
          try {
            const response = await fetch('/api/v1/organizations', {
              headers: { 'Authorization': \`Bearer \${token}\` }
            });
            if (response.ok) {
              setOrgs(await response.json());
            }
          } catch (error) {
            console.error('Failed to fetch organizations:', error);
          } finally {
            setLoading(false);
          }
        };
        
        fetchOrgs();
      }, [token]);
      
      return { orgs, loading };
    }
    
    // OrganizationSwitcher.jsx
    import { useState } from 'react';
    import { useOrganizations } from '../hooks/useOrganizations';
    import { useAppStore } from '../store/useAppStore';
    
    export function OrganizationSwitcher() {
      const { token, currentOrg, setCurrentOrg } = useAppStore();
      const { orgs, loading } = useOrganizations(token);
      const [open, setOpen] = useState(false);
      
      return (
        <div className="org-switcher">
          <button onClick={() => setOpen(!open)} className="btn btn-subtle">
            {currentOrg?.name || 'Select Organization'}
          </button>
          
          {open && (
            <ul className="dropdown-menu">
              {orgs.map(org => (
                <li 
                  key={org.id}
                  onClick={() => {
                    setCurrentOrg(org);
                    setOpen(false);
                  }}
                  className={currentOrg?.id === org.id ? 'active' : ''}
                >
                  {org.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    ```
    """
    # Get organizations where user is a member or owner
    stmt = select(Organization).join(OrgMember).where(OrgMember.user_id == current_user.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Organization",
    responses={
        201: {"description": "Organization created"}
    }
)
async def create_organization(
    org_in: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    r"""
    Create a new organization. Current user becomes owner.
    
    **React Integration Example:**
    
    ```javascript
    // hooks/useCreateOrganization.js
    import { useState } from 'react';
    
    export function useCreateOrganization(token) {
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      
      const createOrg = async (name, slug) => {
        setLoading(true);
        setError(null);
        
        try {
          const response = await fetch('/api/v1/organizations', {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${token}\`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, slug })
          });
          
          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to create organization');
          }
          
          return await response.json();
        } catch (err) {
          setError(err.message);
          return null;
        } finally {
          setLoading(false);
        }
      };
      
      return { createOrg, loading, error };
    }
    
    // CreateOrgModal.jsx
    import { useState } from 'react';
    import { useCreateOrganization } from '../hooks/useCreateOrganization';
    import { useAppStore } from '../store/useAppStore';
    
    export function CreateOrgModal({ onClose, onSuccess }) {
      const { token } = useAppStore();
      const { createOrg, loading, error } = useCreateOrganization(token);
      const [formData, setFormData] = useState({ name: '', slug: '' });
      
      const handleSubmit = async (e) => {
        e.preventDefault();
        const org = await createOrg(formData.name, formData.slug);
        if (org) {
          onSuccess?.(org);
          onClose?.();
        }
      };
      
      return (
        <div className="modal">
          <h3>Create Organization</h3>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Organization Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="My Organization"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Slug (URL-friendly)</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({...formData, slug: e.target.value})}
                placeholder="my-org"
                required
              />
            </div>
            
            {error && <div className="alert alert-error">{error}</div>}
            
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Creating...' : 'Create Organization'}
            </button>
            
            <button 
              type="button" 
              onClick={onClose} 
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </form>
        </div>
      );
    }
    ```
    """
    # Check if slug exists
    existing = await db.execute(select(Organization).where(Organization.slug == org_in.slug))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Slug already exists")

    org = Organization(
        name=org_in.name,
        slug=org_in.slug,
        owner_id=current_user.id
    )
    db.add(org)
    await db.flush()

    member = OrgMember(
        org_id=org.id,
        user_id=current_user.id,
        role="owner"
    )
    db.add(member)
    
    # Section 10.2: Automatic Subscription Initialization
    # All new organizations start on the Free trial (Starter trial: 30 days or 60 mins, whichever first)
    free_plan_id = UUID("f47ac10b-58cc-4372-a567-0e02b2c3d479")
    subscription = Subscription(
        org_id=org.id,
        plan_id=free_plan_id,
        status="trialing",
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow() + timedelta(days=30),  # 30-day trial
        cancel_at_period_end=False
    )
    db.add(subscription)

    # Log before single commit so create + audit are atomic
    await log_event(db, current_user.id, "create_org", "organization", {"org_id": str(org.id)})
    await db.commit()
    await db.refresh(org)

    return org

@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Organization).where(Organization.id == org_id)
    result = await db.execute(stmt)
    org = result.scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Check membership
    stmt = select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    member = (await db.execute(stmt)).scalars().first()
    return org
    
@router.get(
    "/{org_id}/analytics",
    summary="Get Organization Analytics"
)
async def get_org_analytics(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get summarized analytics for the organization."""
    # Check membership
    stmt = select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    member = (await db.execute(stmt)).scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    
    service = AnalyticsService(db)
    stats = await service.get_dashboard_stats(org_id)
    return stats

@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: UUID,
    org_update: OrganizationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Organization).where(Organization.id == org_id)
    org = (await db.execute(stmt)).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Only owner or admin can update
    stmt = select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    member = (await db.execute(stmt)).scalars().first()
    if not member or member.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if org_update.name:
        org.name = org_update.name
    if org_update.settings:
        org.settings = org_update.settings
    
    await db.commit()
    await db.refresh(org)
    return org

@router.get(
    "/{org_id}/members",
    response_model=List[OrgMemberDetailResponse],
    summary="List Organization Members",
    responses={
        200: {"description": "Members retrieved"}
    }
)
async def list_members(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    r"""
    Get all members in organization.
    
    **React Integration Example:**
    
    ```javascript
    // hooks/useOrgMembers.js
    import { useState, useEffect } from 'react';
    
    export function useOrgMembers(orgId, token) {
      const [members, setMembers] = useState([]);
      const [loading, setLoading] = useState(true);
      
      useEffect(() => {
        const fetchMembers = async () => {
          try {
            const response = await fetch(
              \`/api/v1/organizations/\${orgId}/members\`,
              { headers: { 'Authorization': \`Bearer \${token}\` } }
            );
            if (response.ok) {
              setMembers(await response.json());
            }
          } catch (error) {
            console.error('Failed to fetch members:', error);
          } finally {
            setLoading(false);
          }
        };
        
        fetchMembers();
      }, [orgId, token]);
      
      return { members, loading };
    }
    
    // TeamMembersList.jsx
    import { useOrgMembers } from '../hooks/useOrgMembers';
    import { useAppStore } from '../store/useAppStore';
    
    export function TeamMembersList({ orgId }) {
      const { token } = useAppStore();
      const { members, loading } = useOrgMembers(orgId, token);
      
      if (loading) return <div>Loading members...</div>;
      
      const roleColor = {
        owner: 'badge-red',
        admin: 'badge-orange',
        moderator: 'badge-blue',
        member: 'badge-gray'
      };
      
      return (
        <div className="members-list">
          <h3>Team Members</h3>
          
          <table className="members-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.user_id}>
                  <td>{m.user?.name}</td>
                  <td>{m.user?.email}</td>
                  <td>
                    <span className={\`badge \${roleColor[m.role] || 'badge-gray'}\`}>
                      {m.role.toUpperCase()}
                    </span>
                  </td>
                  <td>{new Date(m.joined_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    ```
    """
    # Check membership
    stmt = select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    member = (await db.execute(stmt)).scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Enriched query: join OrgMember with User to return email/name
    stmt = select(OrgMember, User).join(User, OrgMember.user_id == User.id).where(OrgMember.org_id == org_id)
    result = await db.execute(stmt)
    rows = result.all()
    
    enriched = []
    for member_row, user_row in rows:
        enriched.append(OrgMemberDetailResponse(
            user_id=member_row.user_id,
            email=user_row.email,
            full_name=user_row.full_name,
            role=member_row.role,
            joined_at=member_row.joined_at,
            is_active=user_row.is_active,
        ))
    return enriched


@router.patch("/{org_id}/members/{user_id}", tags=["organizations"])
async def update_member_role(
    org_id: UUID,
    user_id: UUID,
    role: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change a member's role within the organization.
    
    - owners can assign any role including 'admin'
    - admins can only assign 'moderator' or 'member' (not 'admin', to prevent privilege escalation)
    """
    valid_roles = ["admin", "moderator", "member", "manager", "viewer"]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")

    caller = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    )).scalars().first()
    if not caller or caller.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Prevent privilege escalation: only owners can grant admin role
    if role == "admin" and caller.role != "owner":
        raise HTTPException(status_code=403, detail="Only organization owners can assign the admin role")

    target = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )).scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == "owner":
        raise HTTPException(status_code=403, detail="Cannot change the owner's role")

    old_role = target.role
    target.role = role

    # Audit log included in same commit for atomicity
    await log_event(db, current_user.id, "member_role_changed", "org_member", {
        "org_id": str(org_id),
        "target_user_id": str(user_id),
        "old_role": old_role,
        "new_role": role,
    })
    await db.commit()
    return {"status": "updated", "user_id": str(user_id), "new_role": role}


@router.delete("/{org_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["organizations"])
async def remove_member(
    org_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a member from the organization.
    
    - owners can remove anyone except themselves
    - admins can remove members and moderators, but NOT other admins (prevents lateral escalation)
    """
    caller = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    )).scalars().first()
    if not caller or caller.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    target = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )).scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == "owner":
        raise HTTPException(status_code=403, detail="Cannot remove the organization owner")

    # Admins cannot remove other admins — only owners can
    if caller.role == "admin" and target.role == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot remove other admins. Contact the org owner.")

    # Audit before commit so removal and log are atomic
    await log_event(db, current_user.id, "member_removed", "org_member", {
        "org_id": str(org_id),
        "target_user_id": str(user_id),
        "removed_role": target.role,
    })
    await db.delete(target)
    await db.commit()


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["organizations"])
async def delete_organization(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete an organization.
    
    Permitted for: organization owners and site-wide system admins.
    """
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the organization owner or a system admin can delete it")

    await log_event(db, current_user.id, "delete_org", "organization", {"org_id": str(org_id)})
    await db.delete(org)
    await db.commit()

@router.post("/{org_id}/leave", status_code=status.HTTP_200_OK, tags=["organizations"])
async def leave_organization(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Leave an organization."""
    stmt = select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    member = (await db.execute(stmt)).scalars().first()
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this organization")
        
    if member.role == "owner":
        raise HTTPException(status_code=400, detail="The owner cannot leave the organization. Transfer ownership or delete the organization instead.")

    await log_event(db, current_user.id, "member_left", "org_member", {
        "org_id": str(org_id),
        "user_id": str(current_user.id)
    })
    
    await db.delete(member)
    await db.commit()
    return {"status": "success", "message": "Successfully left the organization"}


# ==================== ROLES ====================

@router.get(
    "/{org_id}/roles",
    response_model=List[RoleResponse],
    summary="List Available Roles",
    responses={200: {"description": "Roles retrieved"}}
)
async def list_roles(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return the built-in role definitions with permissions.
    
    Roles are static — they are defined in the codebase, not in the database.
    This endpoint lets the frontend render the permission matrix and role pickers.
    """
    # Verify the caller is a member of this org
    stmt = select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    member = (await db.execute(stmt)).scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return BUILT_IN_ROLES


# ==================== ADD MEMBER BY EMAIL ====================

@router.post(
    "/{org_id}/members/add",
    response_model=OrgMemberDetailResponse,
    summary="Add Member by Email",
    responses={
        200: {"description": "Member added"},
        400: {"description": "Invalid role or user already a member"},
        404: {"description": "User not found"}
    }
)
async def add_member_by_email(
    org_id: UUID,
    body: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add an existing user to the organization by email.
    
    - Only owners and admins can add members.
    - Only owners can add someone as admin.
    - Cannot add someone as owner (use transfer-ownership instead).
    """
    valid_roles = ["admin", "manager", "member", "viewer"]
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")
    
    # Check caller permissions
    caller = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    )).scalars().first()
    if not caller or caller.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can add members")
    
    # Only owners can grant admin
    if body.role == "admin" and caller.role != "owner":
        raise HTTPException(status_code=403, detail="Only the organization owner can assign the admin role")
    
    # Find the user by email
    target_user = (await db.execute(
        select(User).where(User.email == body.email)
    )).scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"No user found with email '{body.email}'")
    
    # Check if already a member
    existing = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == target_user.id)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member of this organization")
    
    # Add to org
    new_member = OrgMember(
        org_id=org_id,
        user_id=target_user.id,
        role=body.role
    )
    db.add(new_member)
    
    await log_event(db, current_user.id, "member_added", "org_member", {
        "org_id": str(org_id),
        "target_user_id": str(target_user.id),
        "target_email": body.email,
        "assigned_role": body.role,
    })
    await db.commit()
    
    logger.info(f"Added user {body.email} to org {org_id} as {body.role}")
    
    return OrgMemberDetailResponse(
        user_id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        role=body.role,
        joined_at=new_member.joined_at,
        is_active=target_user.is_active,
    )


# ==================== TRANSFER OWNERSHIP ====================

@router.post(
    "/{org_id}/transfer-ownership",
    summary="Transfer Organization Ownership",
    responses={
        200: {"description": "Ownership transferred"},
        403: {"description": "Only the current owner can transfer ownership"},
        404: {"description": "Target user not a member"}
    }
)
async def transfer_ownership(
    org_id: UUID,
    body: TransferOwnershipRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Transfer organization ownership to another member.
    
    - Only the current owner can transfer ownership.
    - The new owner must already be a member of the organization.
    - The old owner is demoted to admin.
    """
    # Verify caller is the owner
    caller = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    )).scalars().first()
    if not caller or caller.role != "owner":
        raise HTTPException(status_code=403, detail="Only the current owner can transfer ownership")
    
    # Verify target is a member
    target = (await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == body.new_owner_user_id)
    )).scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user is not a member of this organization")
    if target.role == "owner":
        raise HTTPException(status_code=400, detail="Target user is already the owner")
    
    # Swap roles
    caller.role = "admin"     # Old owner becomes admin
    target.role = "owner"     # New owner
    
    # Update the organization's owner_id
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if org:
        org.owner_id = body.new_owner_user_id
    
    await log_event(db, current_user.id, "ownership_transferred", "organization", {
        "org_id": str(org_id),
        "old_owner": str(current_user.id),
        "new_owner": str(body.new_owner_user_id),
    })
    await db.commit()
    
    logger.info(f"Ownership of org {org_id} transferred from {current_user.id} to {body.new_owner_user_id}")
    
    return {
        "status": "transferred",
        "new_owner_user_id": str(body.new_owner_user_id),
        "old_owner_new_role": "admin"
    }
