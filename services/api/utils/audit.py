from functools import wraps
from app.models.models import AuditLog
from app.core.database import SessionLocal
from datetime import datetime
import logging

logger = logging.getLogger("audit")

def audit_log(action: str, resource_type: str = "general"):
    """
    Decorator to log sensitive actions to the AuditLog table.
    Assumes the decorated function has access to db (first or second arg) 
    and current_user (comes from Depends).
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Execute the function
            result = await func(*args, **kwargs)
            
            # Extract info for logging
            db = kwargs.get("db") or (args[1] if len(args) > 1 else None)
            current_user = kwargs.get("current_user")
            
            if db and current_user:
                try:
                    log_entry = AuditLog(
                        actor_id=current_user.id,
                        actor_type="user",
                        action=action,
                        resource_id=str(kwargs.get("org_id", "")),
                        resource_type=resource_type,
                        outcome="success",
                        payload={"args": str(kwargs.get("org_id", ""))}
                    )
                    db.add(log_entry)
                    # Note: commit is usually handled by the route itself
                except Exception as e:
                    logger.error(f"Failed to create audit log: {e}")
            
            return result
        return wrapper
    return decorator

async def log_event(db, actor_id, action, resource_type, payload=None, actor_type="user", outcome="success", org_id=None):
    """Manual logging function."""
    # Try to extract org_id from payload if not provided
    if not org_id and payload:
        org_id = payload.get("org_id")
    
    log_entry = AuditLog(
        org_id=org_id,
        actor_id=actor_id,
        actor_type=actor_type,
        action=action,
        resource_id=payload.get("org_id", "") if payload and not org_id else str(org_id or ""),
        resource_type=resource_type,
        outcome=outcome,
        payload=payload or {}
    )
    db.add(log_entry)
    await db.flush() # Ensure it gets an ID but don't commit here
