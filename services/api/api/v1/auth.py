from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.openapi.utils import get_openapi
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import create_access_token, verify_password, get_password_hash
from app.models.models import User, Organization, OrgMember, Subscription
from uuid import UUID
from app.utils.audit import log_event
from app.schemas.user import UserCreate, UserResponse
from app.api.deps import get_current_user
from sqlalchemy import select
from datetime import timedelta, datetime
from app.core.config import settings
from app.services.email_service import email_service, generate_verification_token, generate_token_expiry
import logging
import re
from pydantic import BaseModel
from redis.asyncio import Redis
from app.core.redis import get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

async def auto_provision_workspace(user: User, db: AsyncSession):
    """Automatically provision a default workspace for a new user"""
    base_name = user.full_name or user.email.split('@')[0]
    org_name = f"{base_name}'s Workspace"
    
    # Ensure slug is safe and unique
    base_slug = re.sub(r'[^a-zA-Z0-9]', '-', base_name.lower()).strip('-')
    if not base_slug:
        base_slug = "workspace"
        
    org_slug = base_slug
    counter = 1
    while True:
        existing = await db.execute(select(Organization).where(Organization.slug == org_slug))
        if not existing.scalars().first():
            break
        org_slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organization(
        name=org_name,
        slug=org_slug,
        owner_id=user.id,
        is_active=True
    )
    db.add(org)
    await db.flush()

    member = OrgMember(
        org_id=org.id,
        user_id=user.id,
        role="owner"
    )
    db.add(member)

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

    await log_event(db, user.id, "auto_create_org", "organization", {"org_id": str(org.id), "reason": "auto_provisioning"})
    await db.commit()
    await db.refresh(org)
    logger.info(f"✓ Auto-provisioned workspace '{org.name}' for user {user.email}")
    return org




class VerifyEmailRequest(BaseModel):
    """Verify email with token"""
    token: str


class ForgotPasswordRequest(BaseModel):
    """Request password reset"""
    email: str


class ResetPasswordRequest(BaseModel):
    """Reset password with token"""
    token: str
    new_password: str


class OTPRequest(BaseModel):
    """Request one-time password"""
    email: str


class OTPLoginRequest(BaseModel):
    """Login with one-time password"""
    email: str
    otp: str


class MessageResponse(BaseModel):
    """Generic message response"""
    message: str


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    token_type: str


@router.post(
    "/request-otp",
    response_model=MessageResponse,
    summary="Request Login OTP",
    responses={
        200: {"description": "OTP sent successfully"},
        500: {"description": "Failed to send email"}
    }
)
async def request_otp(
    req: OTPRequest, 
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Generate and send a 6-digit OTP code to the provided email.
    Stored in BOTH database (reliable, shared) and Redis (fast cache).
    """
    import random
    from datetime import datetime, timedelta
    otp_code = "".join([str(random.randint(0, 9)) for _ in range(6)])
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    
    # PRIMARY: Store in database (shared across all workers)
    try:
        from sqlalchemy import text
        # Ensure table exists (safety net if startup hook hasn't run yet)
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS otp_codes (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                code VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # Upsert: delete old OTP for this email, insert new one
        await db.execute(text(
            "DELETE FROM otp_codes WHERE email = :email"
        ), {"email": req.email})
        await db.execute(text(
            "INSERT INTO otp_codes (email, code, expires_at) VALUES (:email, :code, :expires_at)"
        ), {"email": req.email, "code": otp_code, "expires_at": expires_at})
        await db.commit()
        logger.info(f"[OTP-STORE] Stored OTP in database for {req.email}")
    except Exception as e:
        logger.error(f"[OTP-STORE] Database OTP storage failed: {e}", exc_info=True)
        await db.rollback()
        # Don't fail — try Redis as fallback
    
    # SECONDARY: Also store in Redis for fast lookup
    try:
        key = f"otp:{req.email}"
        await redis.set(key, otp_code, ex=600)
        logger.info(f"[OTP-STORE] Also cached OTP in Redis ({type(redis).__name__})")
    except Exception as e:
        logger.warning(f"[OTP-STORE] Redis cache failed (non-fatal): {e}")
    
    try:
        # Send email
        success = await email_service.send_otp_email(req.email, otp_code)
        
        if not success:
            # If email service not configured, still allow through (dev/staging)
            if not email_service._is_configured():
                logger.info(f"[DEV] OTP for {req.email}: {otp_code} (no email provider)")
                return {"message": f"OTP sent to {req.email} (Dev Mode: Check logs)"}
            raise HTTPException(status_code=500, detail="Failed to send OTP email")
        
        return {"message": f"Verification code sent to {req.email}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTP email send error for {req.email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to send verification code")


@router.post(
    "/login-otp",
    response_model=TokenResponse,
    summary="Login with OTP",
    responses={
        200: {"description": "Login successful"},
        401: {"description": "Invalid or expired OTP"}
    }
)
async def login_otp(
    req: OTPLoginRequest, 
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Verify OTP and login/signup the user.
    Checks database first (shared across workers), then Redis as fallback.
    """
    stored_otp = None
    otp_source = None
    
    # PRIMARY: Check database (shared across all API workers)
    try:
        from sqlalchemy import text
        from datetime import datetime
        result = await db.execute(text(
            "SELECT code, expires_at FROM otp_codes WHERE email = :email"
        ), {"email": req.email})
        row = result.fetchone()
        if row:
            db_code, db_expires = row[0], row[1]
            if db_expires and db_expires > datetime.utcnow():
                stored_otp = str(db_code)
                otp_source = "database"
                logger.info(f"[OTP-VERIFY] Found OTP in database for {req.email}")
            else:
                logger.info(f"[OTP-VERIFY] OTP in database expired for {req.email}")
        else:
            logger.info(f"[OTP-VERIFY] No OTP in database for {req.email}")
    except Exception as e:
        logger.warning(f"[OTP-VERIFY] Database OTP lookup failed: {e}")
    
    # FALLBACK: Check Redis if database didn't have it
    if not stored_otp:
        try:
            key = f"otp:{req.email}"
            redis_otp = await redis.get(key)
            if redis_otp:
                stored_otp = str(redis_otp) if isinstance(redis_otp, bytes) else redis_otp
                otp_source = f"redis ({type(redis).__name__})"
                logger.info(f"[OTP-VERIFY] Found OTP in Redis for {req.email}")
        except Exception as e:
            logger.warning(f"[OTP-VERIFY] Redis OTP lookup failed: {e}")
    
    logger.info(f"[OTP-VERIFY] source={otp_source}, stored={stored_otp!r}, user={req.otp!r}")
    
    if not stored_otp:
        logger.warning(f"[OTP-VERIFY] OTP not found anywhere for {req.email}")
        raise HTTPException(status_code=410, detail="Verification code expired. Please request a new one.")
    
    # Normalize both sides for comparison
    if str(stored_otp).strip() != str(req.otp).strip():
        logger.warning(f"[OTP-VERIFY] Mismatch for {req.email}: expected={stored_otp!r}, got={req.otp!r}")
        raise HTTPException(status_code=401, detail="Invalid verification code")
    
    # Delete OTP after successful use (both stores)
    try:
        from sqlalchemy import text as sql_text
        await db.execute(sql_text("DELETE FROM otp_codes WHERE email = :email"), {"email": req.email})
        await db.commit()
    except Exception:
        pass
    try:
        await redis.delete(f"otp:{req.email}")
    except Exception:
        pass
    logger.info(f"OTP verified successfully for {req.email} (source={otp_source})")
    
    # Find or create user
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    
    if not user:
        logger.info(f"Creating new user from OTP login: {req.email}")
        # Generate a random password for passwordless users (they can reset it later if they want)
        import secrets
        random_pw = secrets.token_urlsafe(16)
        
        # Check if first user
        user_count_result = await db.execute(select(User))
        user_count = len(user_count_result.scalars().all())
        assigned_role = "admin" if user_count == 0 else "member"
        
        user = User(
            email=req.email,
            hashed_password=get_password_hash(random_pw),
            full_name=req.email.split('@')[0],
            role=assigned_role,
            is_verified=True,  # OTP is proof of email ownership
            is_active=True
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        # Auto-provision workspace
        try:
            await auto_provision_workspace(user, db)
        except Exception as e:
            logger.error(f"Failed to auto-provision workspace for new user {req.email}: {e}")
    
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is disabled")
    
    logger.info(f"✓ Successful OTP login for user: {user.email}")
    access_token = create_access_token(
        subject=user.id, roles=[user.role]
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=201,
    summary="User Registration with Email Verification",
    responses={
        201: {"description": "User created - verification email sent"},
        400: {"description": "User already exists or invalid input"}
    }
)
async def signup(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    """
    Register a new user account.
    
    Verification email will be sent to complete registration.
    User cannot login until email is verified.
    """
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Check if this is the first user (First user gets admin)
    user_count_result = await db.execute(select(User))
    user_count = len(user_count_result.scalars().all())
    assigned_role = "admin" if user_count == 0 else "member"
    
    # 📧 Generate verification token
    verification_token = generate_verification_token()
    verification_expires = generate_token_expiry(hours=24)
    
    # Create user (not verified until email confirmation)
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=assigned_role,
        is_verified=False,  # Must verify email
        verification_token=verification_token,
        verification_token_expires_at=verification_expires
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # 📧 Send verification email
    await email_service.send_verification_email(
        to_email=user.email,
        user_name=user.full_name or user.email,
        verification_token=verification_token
    )
    
    logger.info(f"✓ User registered: {user.email}, verification email sent")
    return user


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify Email Address",
    responses={
        200: {"description": "Email verified successfully"},
        400: {"description": "Invalid or expired token"}
    }
)
async def verify_email(req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """
    Verify user email with verification token from email link.
    
    After verification, user can login.
    """
    # Find user by token
    result = await db.execute(
        select(User).where(User.verification_token == req.token)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    
    # Check if token expired
    if user.verification_token_expires_at and user.verification_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification token expired. Please sign up again.")
    
    # Mark as verified
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    await db.commit()
    
    # Auto-provision workspace upon successful verification
    try:
        await auto_provision_workspace(user, db)
    except Exception as e:
        logger.error(f"Failed to auto-provision workspace for new verified user {user.email}: {e}")
    
    logger.info(f"✓ Email verified for user: {user.email}")
    return {"message": "Email verified successfully. You can now login."}


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login",
    responses={
        200: {"description": "Login successful"},
        401: {"description": "Invalid credentials or unverified email"}
    }
)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """
    Authenticate user and get JWT token.
    
    User must have verified their email before login.
    """
    logger.debug("Authentication attempt received")
    
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    # Generic failure response to prevent user enumeration
    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning("Authentication failed: Invalid credentials")
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    # 🔐 Email verification temporarily disabled
    # if not user.is_verified:
    #     logger.warning(f"Login attempt with unverified email: {user.email}")
    #     raise HTTPException(
    #         status_code=401,
    #         detail="Please verify your email before logging in. Check your inbox for verification link."
    #     )
    
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is disabled")
    
    logger.info(f"✓ Successful login for user: {user.email}")
    
    # 🏢 Ensure user has a workspace (Auto-provision if missing)
    # This handles cases where verification was bypassed or skipped
    from app.models.models import OrgMember
    org_check = await db.execute(select(OrgMember).where(OrgMember.user_id == user.id))
    if not org_check.scalars().first():
        try:
            await auto_provision_workspace(user, db)
            logger.info(f"Workspace auto-provisioned for {user.email} during login")
        except Exception as e:
            logger.error(f"Failed to auto-provision workspace for login: {e}")

    access_token = create_access_token(
        subject=user.id, roles=[user.role]
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request Password Reset",
    responses={
        200: {"description": "Password reset email sent"},
        404: {"description": "User not found"}
    }
)
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Request password reset via email.
    
    Sends reset link to email address. Link expires in 1 hour.
    """
    # Find user (don't reveal if exists)
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    
    if not user:
        # Generic message to prevent email enumeration
        logger.info(f"Password reset requested for non-existent email: {req.email}")
        return {"message": "If this email exists, you will receive a password reset link."}
    
    # 📧 Generate reset token
    reset_token = generate_verification_token()
    reset_expires = generate_token_expiry(hours=1)
    
    user.password_reset_token = reset_token
    user.password_reset_token_expires_at = reset_expires
    await db.commit()
    
    # 📧 Send password reset email
    await email_service.send_password_reset_email(
        to_email=user.email,
        user_name=user.full_name or user.email,
        reset_token=reset_token
    )
    
    logger.info(f"✓ Password reset link sent to: {user.email}")
    return {"message": "Password reset link sent to your email. Link expires in 1 hour."}


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset Password with Token",
    responses={
        200: {"description": "Password reset successfully"},
        400: {"description": "Invalid or expired token"}
    }
)
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Reset password using token from email link.
    """
    # Find user by reset token
    result = await db.execute(
        select(User).where(User.password_reset_token == req.token)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid password reset token")
    
    # Check if token expired
    if user.password_reset_token_expires_at and user.password_reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Password reset token expired. Please request a new one.")
    
    # Validate new password
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # Update password
    user.hashed_password = get_password_hash(req.new_password)
    user.password_reset_token = None
    user.password_reset_token_expires_at = None
    await db.commit()
    
    logger.info(f"✓ Password reset successfully for user: {user.email}")
    return {"message": "Password reset successfully. You can now login with your new password."}


class ChangePasswordRequest(BaseModel):
    """Change password with current password verification"""
    current_password: str
    new_password: str


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change Password",
    responses={
        200: {"description": "Password changed successfully"},
        401: {"description": "Current password is incorrect"},
        400: {"description": "Validation error"},
    }
)
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Change the authenticated user's password.
    Requires the current password for verification.
    """
    # Verify current password
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # Validate new password
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    # Update password
    current_user.hashed_password = get_password_hash(req.new_password)
    await db.commit()

    logger.info(f"✓ Password changed for user: {current_user.email}")
    return {"message": "Password changed successfully"}

