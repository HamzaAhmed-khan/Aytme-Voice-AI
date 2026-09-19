from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.schemas.api_token import ApiTokenResponse, ApiTokenCreatedResponse, ApiTokenCreate
from app.api.deps import get_current_user
from app.models.models import User, ApiToken
from typing import List
from uuid import UUID
import secrets
import hashlib

router = APIRouter()

@router.get(
    "/",
    response_model=List[ApiTokenResponse],
    summary="List API Tokens",
    description="""
List all API tokens belonging to the current user.

API tokens enable **server-to-server integrations** without exposing your user credentials.
Each token has configurable scopes (e.g. `room:read`, `room:write`).

> **Note:** The raw token secret is only returned **once** at creation time and cannot be retrieved again.

**React Integration Example:**

```javascript
// hooks/useApiTokens.js
import { useState, useEffect } from 'react';

export function useApiTokens(token) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTokens = async () => {
    const res = await fetch('/api/v1/api-tokens/', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setTokens(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchTokens(); }, [token]);

  return { tokens, loading, refetch: fetchTokens };
}
```
    """,
    responses={
        200: {"description": "List of API tokens (secret not included)"},
        401: {"description": "Unauthorized"},
    }
)
async def list_tokens(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch Developer API tokens."""
    query = select(ApiToken).where(ApiToken.user_id == current_user.id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/",
    response_model=ApiTokenCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create API Token",
    description="""
Issue a new scoped API token for server-to-server integration.

**⚠️ IMPORTANT:** The raw token secret is returned **only once** in the response.
Store it securely — it cannot be retrieved again. The system stores only a SHA-256 hash.

**Available Scopes:**
- `room:read` — List and view rooms
- `room:write` — Create, update, delete rooms and start bots
- `admin:all` — Full system access (admin only)

**React Integration Example:**

```javascript
// Create a new API token
const createToken = async (name, scopes, userToken) => {
  const res = await fetch('/api/v1/api-tokens/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, scopes })
  });
  if (!res.ok) throw new Error('Failed to create token');
  const data = await res.json();
  // data.token is the raw secret — store it NOW
  return data;
};
```
    """,
    responses={
        201: {"description": "Token created — raw secret returned once"},
        401: {"description": "Unauthorized"},
        422: {"description": "Validation error"},
    }
)
async def create_token(
    token_in: ApiTokenCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Issue a new API token for server-to-server integration."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    db_obj = ApiToken(
        user_id=current_user.id,
        name=token_in.name,
        token_hash=token_hash,
        scopes=token_in.scopes
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    response = ApiTokenCreatedResponse.model_validate(db_obj)
    response.token = raw_token  # Return the raw token ONLY once
    return response


@router.delete(
    "/{token_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke API Token",
    description="""
Permanently revoke an API token. This action is irreversible.

Any requests made with this token after revocation will receive a `401 Unauthorized` response.

**React Integration Example:**

```javascript
// Revoke a token with confirmation dialog
const revokeToken = async (tokenId, userToken) => {
  const confirmed = window.confirm('Are you sure? This token will stop working immediately.');
  if (!confirmed) return false;

  const res = await fetch(`/api/v1/api-tokens/${tokenId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  return res.status === 204;
};
```
    """,
    responses={
        204: {"description": "Token revoked successfully"},
        401: {"description": "Unauthorized"},
        404: {"description": "Token not found or does not belong to current user"},
    }
)
async def revoke_token(
    token_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revoke an API token."""
    result = await db.execute(select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == current_user.id))
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    
    await db.delete(token)
    await db.commit()
    return None
