from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.user import UserResponse, UserUpdate
from app.api.deps import get_current_user
from app.models.models import User

router = APIRouter()

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get My Profile",
    description="""
Fetch the currently authenticated user's profile and settings.

**React Integration Example:**

```javascript
// hooks/useProfile.js
import { useState, useEffect } from 'react';

export function useProfile(token) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch('/api/v1/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(setProfile);
  }, [token]);

  return profile;
}
```
    """,
    responses={
        200: {"description": "Current user profile"},
        401: {"description": "Invalid or expired JWT token"},
    }
)
async def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    """Fetch current user's profile and default settings."""
    return current_user


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update My Profile",
    description="""
Update the currently authenticated user's profile details (e.g. display name).

**React Integration Example:**

```javascript
// hooks/useUpdateProfile.js
export function useUpdateProfile(token) {
  const updateProfile = async (fullName) => {
    const res = await fetch('/api/v1/users/me', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ full_name: fullName })
    });
    if (!res.ok) throw new Error('Update failed');
    return await res.json();
  };
  return { updateProfile };
}
```
    """,
    responses={
        200: {"description": "Updated user profile"},
        401: {"description": "Unauthorized"},
        422: {"description": "Validation error"},
    }
)
async def update_my_profile(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user details."""
    if user_in.full_name is not None:
        current_user.full_name = user_in.full_name
    
    await db.commit()
    await db.refresh(current_user)
    return current_user
