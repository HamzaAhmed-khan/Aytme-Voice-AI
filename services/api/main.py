from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1 import rooms, auth, transcripts, participants, users, api_tokens, organizations, billing, invitations, admin, webhooks, audit_logs, lobby, realtime_translate, contact
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.redis import redis_manager, get_redis
from app.core.database import get_db
from contextlib import asynccontextmanager
from typing import List
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import Gauge, Histogram
import asyncio
import logging
from app.api.middleware import RateLimitMiddleware
from app.services.custom_domain_service import CustomDomainService

logger = logging.getLogger(__name__)

# 🔴 ERROR TRACKING: Initialize Sentry for production error monitoring
try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from sentry_sdk.integrations.asyncio import AsyncioIntegration
    
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
                AsyncioIntegration(),
            ],
            environment=settings.SENTRY_ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            debug=(settings.ENVIRONMENT == "development"),
            # Capture 100% of errors but sample traces for performance
            before_send=lambda event, hint: event if hint.get("exc_info") else event
        )
        logger.info(f"✓ Sentry initialized for environment: {settings.SENTRY_ENVIRONMENT}")
    else:
        logger.warning("⚠️  Sentry not configured (SENTRY_DSN not set). Error tracking disabled.")
        
except ImportError:
    logger.warning("⚠️  Sentry package not installed. Install with: pip install sentry-sdk")
except Exception as e:
    logger.error(f"Failed to initialize Sentry: {str(e)}")

# Custom Metrics (Section 4.7 & 6)
ROOM_GAUGE = Gauge("aytme_concurrent_rooms", "Number of currently active rooms")
PROCESSING_LATENCY = Histogram("aytme_worker_processing_latency_seconds", "Latency of media processing jobs")


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background startup task - won't block server from starting
    async def delayed_startup():
        # Sync settings from DB first
        async for db in get_db():
            await settings.update_from_db(db)
            
            # Ensure otp_codes table exists (required for database-backed OTP)
            try:
                from sqlalchemy import text
                await db.execute(text("""
                    CREATE TABLE IF NOT EXISTS otp_codes (
                        id SERIAL PRIMARY KEY,
                        email VARCHAR(255) NOT NULL,
                        code VARCHAR(10) NOT NULL,
                        expires_at TIMESTAMP NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                await db.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_otp_codes_email ON otp_codes (email)"
                ))
                await db.commit()
                logger.info("[STARTUP] otp_codes table ensured")
            except Exception as e:
                logger.warning(f"[STARTUP] otp_codes table creation skipped: {e}")
                await db.rollback()
            
            break

        await asyncio.sleep(2)
        try:
            from app.services.usage_processor import process_usage_events
            asyncio.create_task(process_usage_events(manager))
            
            from app.services.retention_service import run_data_retention_cleanup
            asyncio.create_task(run_data_retention_cleanup())
            
            # 🔐 GRACE PERIOD: Start grace period cleanup loop (every hour)
            from app.services.grace_period_service import background_grace_period_monitor
            asyncio.create_task(background_grace_period_monitor())

            # 💳 PAYPAL: Validate configured plans on startup
            try:
                logger.info(f"[PAYPAL] Starting startup validation for {settings.PAYPAL_ENV}...")
                from app.models.models import Plan
                from app.services.billing_service import paypal_client
                from sqlalchemy import select
                
                async for db in get_db():
                    result = await db.execute(select(Plan).where(Plan.is_active == True))
                    active_plans = result.scalars().all()
                    
                    found_valid = 0
                    for plan in active_plans:
                        if plan.paypal_plan_id and plan.paypal_plan_id.startswith("P-"):
                            logger.info(f"[PAYPAL] Validating Plan: {plan.name} ({plan.paypal_plan_id})")
                            is_active = await paypal_client.validate_plan(plan.paypal_plan_id)
                            if is_active:
                                found_valid += 1
                            else:
                                logger.error(f"[PAYPAL][CRITICAL] Plan {plan.name} is INACTIVE in {settings.PAYPAL_ENV}")
                    
                    if found_valid > 0:
                        logger.info(f"✓ [PAYPAL] Startup validation complete. {found_valid} plans ready.")
                    else:
                        logger.warning(f"⚠️  [PAYPAL] No active PayPal plans found for environment: {settings.PAYPAL_ENV}")
                    break
            except Exception as e:
                logger.error(f"[PAYPAL][ERROR] Startup validation failed: {str(e)}")
            
        except Exception as e:
            logger.error(f"Background services failed: {e}")

        # 🕵️ WORKER WATCHDOG: Re-enqueue crashed rooms
        async def worker_watchdog():
            from app.models.models import Room
            from sqlalchemy import select
            import json
            while True:
                await asyncio.sleep(15)
                try:
                    async for db in get_db():
                        result = await db.execute(select(Room).where(Room.status == "active"))
                        active_rooms = result.scalars().all()
                        
                        redis = await redis_manager.get_client()
                        for room in active_rooms:
                            exists = await redis.exists(f"room_worker:{str(room.id)}")
                            if not exists:
                                logger.warning(f"[WATCHDOG] Worker for room {room.id} died! Re-enqueuing.")
                                job_data = {
                                    "type": "bot_start",
                                    "room_id": str(room.id),
                                    "livekit_room_id": room.livekit_room_id or str(room.id),
                                    "mode": room.mode,
                                    "primary_lang": room.primary_lang or "English",
                                    "secondary_lang": room.secondary_lang or "",
                                    "available_langs": ",".join(room.target_langs) if room.target_langs else ""
                                }
                                await redis.xadd("worker:jobs", {"data": json.dumps(job_data)})
                        break
                except Exception as e:
                    logger.error(f"Worker watchdog error: {e}")

        asyncio.create_task(worker_watchdog())

    # ── CRITICAL: Create tables + seed admin BEFORE server accepts requests ──
    try:
        from app.core.database import engine
        from app.models.models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("✓ Database tables synced (create_all)")
    except Exception as e:
        logger.warning(f"Table sync warning: {e}")

    # Seed admin users from env if not exists (supports multiple comma-separated emails)
    try:
        from app.models.models import User
        from sqlalchemy import select, func
        from app.core.security import get_password_hash

        admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
        for admin_email in admin_emails:
            async for db in get_db():
                result = await db.execute(select(User).where(User.email == admin_email))
                admin_user = result.scalars().first()
                if not admin_user:
                    admin_user = User(
                        email=admin_email,
                        hashed_password=get_password_hash(settings.ADMIN_DEFAULT_PASSWORD),
                        full_name="Platform Admin",
                        role="admin",
                        is_active=True,
                        is_verified=True,
                    )
                    db.add(admin_user)
                    await db.commit()
                    # Auto-provision workspace for new admin
                    try:
                        from app.api.v1.auth import auto_provision_workspace
                        await auto_provision_workspace(admin_user, db)
                    except Exception as wp_err:
                        logger.warning(f"Workspace provision for admin {admin_email} skipped: {wp_err}")
                    logger.info(f"✓ Admin user seeded: {admin_email}")
                elif admin_user.role != "admin":
                    admin_user.role = "admin"
                    await db.commit()
                    logger.info(f"✓ Admin role enforced for: {admin_email}")
                else:
                    logger.info(f"✓ Admin user already exists: {admin_email}")
                break
    except Exception as e:
        logger.error(f"Admin seed failed (non-fatal): {e}")

    # Ensure billing plans exist and only desired plans are active
    try:
        from app.models.models import Plan
        from decimal import Decimal
        from sqlalchemy import update

        default_plans = [
            {
                "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Free",
                "description": "Starter trial — 30 days or 60 minutes, whichever comes first",
                "price_monthly": Decimal("0"),
                "minutes_included": 60,
                "overage_rate_per_min": Decimal("0.10"),
                "max_rooms": 2,
                "max_participants": 25,
                "features": {"rooms": 2, "support": "Email", "video": False, "broadcast": False, "trial": True, "trial_days": 30, "trial_minutes": 60, "description": "Free trial — 30 days or 60 mins"},
                "is_active": False,  # Hidden from billing UI — used only for auto-provisioned trial subs
            },
            {
                "id": "f47ac10b-58cc-4372-a567-0e02b2c3d482",
                "name": "Starter",
                "description": "Audio-only starter plan",
                "price_monthly": Decimal("4.99"),
                "minutes_included": 250,
                "overage_rate_per_min": Decimal("0.05"),
                "max_rooms": 2,
                "max_participants": 25,
                "features": {"rooms": 2, "support": "Email", "video": False, "broadcast": False, "upgrade_only": True, "sales_commission_pct": 1, "description": "Audio-only translation"},
                "is_active": True,
            },
            {
                "id": "f47ac10b-58cc-4372-a567-0e02b2c3d480",
                "name": "Pro",
                "description": "Video and conversations",
                "price_monthly": Decimal("9.99"),
                "minutes_included": 1000,
                "overage_rate_per_min": Decimal("0.03"),
                "max_rooms": 10,
                "max_participants": 50,
                "features": {"rooms": 10, "support": "Priority Email", "video": True, "broadcast": False, "upgrade_only": True, "sales_commission_pct": 1, "description": "Video & conversations"},
                "is_active": True,
            },
            {
                "id": "f47ac10b-58cc-4372-a567-0e02b2c3d483",
                "name": "Premium",
                "description": "Broadcast, full features",
                "price_monthly": Decimal("19.99"),
                "minutes_included": 3000,
                "overage_rate_per_min": Decimal("0.02"),
                "max_rooms": 50,
                "max_participants": 200,
                "features": {"rooms": 50, "support": "Priority", "video": True, "broadcast": True, "sales_commission_pct": 1, "description": "Broadcast, full features"},
                "is_active": True,
            },
        ]
        allowed_names = {p["name"].lower() for p in default_plans}

        async for db in get_db():
            for plan_info in default_plans:
                name = plan_info["name"].lower()
                result = await db.execute(select(Plan).where(func.lower(Plan.name) == name))
                existing = result.scalars().first()
                if existing:
                    # Update plan details to the expected values
                    existing.description = plan_info["description"]
                    existing.price_monthly = plan_info["price_monthly"]
                    existing.minutes_included = plan_info["minutes_included"]
                    existing.overage_rate_per_min = plan_info["overage_rate_per_min"]
                    existing.max_rooms = plan_info["max_rooms"]
                    existing.max_participants = plan_info["max_participants"]
                    existing.features = plan_info["features"]
                    existing.is_active = plan_info["is_active"]
                else:
                    db.add(Plan(**plan_info))

            # Deactivate any extra plans not in our list
            await db.execute(
                update(Plan)
                .where(func.lower(Plan.name).notin_(allowed_names))
                .values(is_active=False)
            )
            await db.commit()
            break
        logger.info("✓ Billing plans normalized (Free trial + Starter/Pro/Premium)")
    except Exception as e:
        logger.error(f"Default plan seed failed (non-fatal): {e}")

    asyncio.create_task(delayed_startup())

    yield

    # Shutdown: Close Redis
    await redis_manager.close()


app = FastAPI(
    title="AYTME Real-Time Translation API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

@app.on_event("startup")
async def sync_paypal_plans_on_startup():
    """Automated PayPal plan synchronization on startup."""
    logger.info("=== STARTUP: Beginning PayPal plan sync ===")
    try:
        from app.core.database import SessionLocal as AsyncSessionLocal
        from sqlalchemy import select, or_
        from app.models.models import Plan
        from app.services.billing_service import BillingService
        
        async with AsyncSessionLocal() as db:
            # First just check what's in DB — log it visibly
            result = await db.execute(select(Plan))
            all_plans = result.scalars().all()
            logger.info(f"=== STARTUP: Found {len(all_plans)} plans in DB ===")
            for p in all_plans:
                logger.info(
                    f"=== STARTUP: Plan '{p.name}' | "
                    f"price={p.price_monthly} | "
                    f"paypal_plan_id={p.paypal_plan_id} ==="
                )
            
            # Now sync missing ones
            service = BillingService(db)
            await service.sync_plans_to_paypal()
            
    except Exception as e:
        logger.error(f"=== STARTUP: PayPal sync FAILED: {e} ===", exc_info=True)
        # NEVER raise here — app must boot regardless

# ─── PUBLIC DB SYNC ENDPOINT (one-shot table creation) ───
@app.get("/api/v1/db-sync")
async def db_sync():
    """Creates any missing database tables. Hit this once after deploy."""
    try:
        from app.core.database import engine
        from app.models.models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return {"status": "ok", "message": "All tables synced successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

from fastapi.encoders import jsonable_encoder

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error for {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder({"detail": exc.errors()}),
    )


# 0. Custom Domain Resolution (Phase IV)
@app.middleware("http")
async def custom_domain_middleware(request: Request, call_next):
    host = request.headers.get("host", "").split(":")[0]
    # Skip for standard API domains, local development, and DigitalOcean default domains
    skip_hosts = ["localhost", "127.0.0.1", "aytme.io", "api.aytme.io"]
    
    is_standard_host = host in skip_hosts or host.endswith(".ondigitalocean.app")
    
    if not is_standard_host:
        async for db in get_db():
            service = CustomDomainService(db)
            org_id = await service.resolve_domain(host)
            if org_id:
                request.state.org_id = org_id
                request.state.is_custom_domain = True
            break # Only need one DB session
    
    return await call_next(request)

# --- MIDDLEWARE ORDER: LAST ADDED IS OUTERMOST ---

# 1. Debug logging middleware
@app.middleware("http")
async def debug_log_middleware(request: Request, call_next):
    logger.debug(f"Incoming Request: {request.method} {request.url.path}")
    response = await call_next(request)
    logger.debug(f"Outgoing Response: {response.status_code}")
    return response

# 2. Security Headers (OWASP compliance)
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    
    # Prevent clickjacking
    response.headers["X-Frame-Options"] = "DENY"
    
    # Prevent MIME type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    
    # XSS Protection
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    # Referrer Policy
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # HSTS (if production)
    if settings.is_production():
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Permissions Policy (formerly Feature Policy)
    # Allow required browser capabilities for real-time voice features (Safari/iOS included).
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), autoplay=(self), fullscreen=(self), clipboard-write=(self), geolocation=()"
    
    return response

# 3. Rate Limiting (Phase III)
app.add_middleware(RateLimitMiddleware, user_limit=100, user_window=60, ip_limit=500, ip_window=60)

# 4. CORS Middleware - MUST BE OUTERMOST (Last added)
# ⚠️ SECURITY: Use CORS_ORIGINS from environment, never hardcode
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),  # Dynamic from .env
    allow_credentials=True,  # Allow cookies & auth headers
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "X-Page-Count"],  # For pagination
    max_age=3600,  # Cache CORS preflight for 1 hour
)

# --- ROUTERS ---
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(rooms.router, prefix=f"{settings.API_V1_STR}/rooms", tags=["rooms"])
app.include_router(transcripts.router, prefix=f"{settings.API_V1_STR}/rooms", tags=["transcripts"])
app.include_router(participants.router, prefix=f"{settings.API_V1_STR}/rooms", tags=["participants"])
app.include_router(users.router, prefix=f"{settings.API_V1_STR}/users", tags=["users"])
app.include_router(api_tokens.router, prefix=f"{settings.API_V1_STR}/api-tokens", tags=["api_tokens"])
app.include_router(organizations.router, prefix=f"{settings.API_V1_STR}/organizations", tags=["organizations"])
app.include_router(billing.router, prefix=f"{settings.API_V1_STR}/billing", tags=["billing"])
app.include_router(invitations.router, prefix=f"{settings.API_V1_STR}/invitations", tags=["invitations"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
app.include_router(webhooks.router, prefix=f"{settings.API_V1_STR}/webhooks", tags=["webhooks"])
app.include_router(audit_logs.router, prefix=f"{settings.API_V1_STR}/audit-logs", tags=["audit_logs"])
app.include_router(lobby.router, prefix=f"{settings.API_V1_STR}/rooms", tags=["lobby"])
app.include_router(realtime_translate.router, prefix=f"{settings.API_V1_STR}/realtime", tags=["realtime"])
app.include_router(contact.router, prefix=f"{settings.API_V1_STR}/contact", tags=["contact"])

# --- INSTRUMENTATION ---
# Must be after app instantiation but order relative to routers doesn't matter for metrics
Instrumentator().instrument(app).expose(app)


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/", tags=["system"])
async def root():
    """Root endpoint to provide a stable 200 OK for load balancers."""
    return {
        "status": "active",
        "message": "AYTME Real-Time Translation API is running",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs"
    }

@app.get("/health", tags=["system"])
async def health_check():
    """Simple Liveness Probe (Section 11.2)"""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/health/deep", tags=["system"])
async def deep_health_check(db=Depends(get_db)):
    """
    Section 11.2: Deep Dependency Health Check.
    Verifies Database and Redis connectivity.
    """
    status = {"db": "ok", "redis": "ok", "overall": "healthy"}

    # Test DB
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
    except Exception as e:
        status["db"] = f"unhealthy: {str(e)}"
        status["overall"] = "unhealthy"

    # Test Redis
    try:
        redis = await redis_manager.get_client()
        await redis.ping()
    except Exception as e:
        status["redis"] = f"unhealthy: {str(e)}"
        status["overall"] = "unhealthy"

    if status["overall"] == "unhealthy":
        return JSONResponse(status_code=503, content=status)
    return status

@app.get("/api/v1/system/health/livekit", tags=["system"])
async def health_livekit():
    """Verify LiveKit connectivity and credentials."""
    from app.core.livekit import livekit_manager
    from livekit.protocol import room as proto_room
    try:
        async with livekit_manager.get_api() as lkapi:
            await lkapi.room.list_rooms(proto_room.ListRoomsRequest())
            return {
                "status": "ok",
                "url": settings.LIVEKIT_URL,
                "api_key_last_4": str(settings.LIVEKIT_API_KEY)[-4:] if settings.LIVEKIT_API_KEY else "None"
            }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "detail": str(e),
                "url": settings.LIVEKIT_URL
            }
        )

@app.get("/api/v1/system/health/token-test", tags=["system"])
async def health_token_test():
    """Verify LiveKit token generation logic specifically."""
    from app.core.livekit import livekit_manager
    import traceback
    try:
        # Test with a dummy room and identity
        token = livekit_manager.get_token("health-test-room", "health-test-user")
        return {
            "status": "ok",
            "token_preview": str(token)[:20] + "..." if token else "None",
            "token_length": len(str(token)) if token else 0
        }
    except Exception as e:
        error_info = traceback.format_exc()
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(e),
                "traceback": error_info[:500] 
            }
        )

@app.get("/api/v1/system/health/room-debug/{room_id}", tags=["system"])
async def health_room_debug(room_id: str):
    """Deep inspection of a specific LiveKit room's participants."""
    from app.core.livekit import livekit_manager
    from livekit.protocol import room as proto_room
    import traceback
    try:
        # 1. We check both formatted and raw room ID to see where participants are
        formatted_id = f"room_{room_id[:8]}"
        names_to_check = [room_id, formatted_id]
        
        results = {}
        async with livekit_manager.get_api() as lkapi:
            for name in names_to_check:
                try:
                    response = await lkapi.room.list_participants(name)
                    participants = getattr(response, "participants", [])
                    results[name] = [
                        {"identity": p.identity, "state": str(p.state), "joined_at": p.joined_at}
                        for p in participants
                    ]
                except Exception as e:
                    results[name] = f"Error: {str(e)}"
                    
        return {
            "status": "ok",
            "room_id_searched": room_id,
            "results": results
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(e), "traceback": traceback.format_exc()[:500]}
        )

@app.get("/health/db", tags=["system"])
async def health_db(db: AsyncSession = Depends(get_db)):
    """Simple DB reachability check."""
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "detail": str(e)})
