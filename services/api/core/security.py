import uuid
from datetime import datetime, timedelta
from typing import Any, Union, Optional, List
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")

ALGORITHM = "HS256"

# Section 7.1 RBAC Scope Mapping
# Humanized hierarchy allowing granular control
ROLE_SCOPES = {
    "admin": ["room:read", "room:write", "room:delete", "org:admin", "user:read", "user:write", "admin:all"],
    "owner": ["room:read", "room:write", "room:delete", "org:write"],
    "member": ["room:read", "room:write"],
    "worker": ["room:read", "room:write", "transcript:write"],
    "participant": ["room:read"]
}

def create_access_token(
    subject: Union[str, Any], roles: List[str], expires_delta: timedelta = None, room_id: str = None
) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=60 * 24 * 8)
        
    # Section 7.1 JWT-based auth with JTI for revocation (7.5 logs)
    jti = str(uuid.uuid4())
    
    # Expand roles to scopes (Algorithmic hierarchy)
    scopes = set()
    for role in roles:
        scopes.update(ROLE_SCOPES.get(role, []))
        
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "roles": roles,
        "scopes": list(scopes),
        "jti": jti
    }
    if room_id:
        to_encode["room_id"] = str(room_id)
    # 🔐 SECURITY: Extract secret from SecretStr field
    secret_key = settings.SECRET_KEY.get_secret_value() if hasattr(settings.SECRET_KEY, 'get_secret_value') else str(settings.SECRET_KEY)
    return jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def decode_token(token: str) -> dict:
    # 🔐 SECURITY: Extract secret from SecretStr field
    secret_key = settings.SECRET_KEY.get_secret_value() if hasattr(settings.SECRET_KEY, 'get_secret_value') else str(settings.SECRET_KEY)
    return jwt.decode(token, secret_key, algorithms=[ALGORITHM])
