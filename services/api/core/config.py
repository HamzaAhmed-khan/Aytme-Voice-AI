from pydantic_settings import BaseSettings, SettingsConfigDict # type: ignore
from pydantic import field_validator, Field, SecretStr # type: ignore
from typing import List, Optional
import logging
import os
import sys
import traceback
from pathlib import Path

# Check if .env file exists (for local dev vs docker)
env_file_path = Path(".env")
env_file_config = ".env" if env_file_path.exists() else None

# NUCLEAR DEBUG: Print directly to stdout before anything else
print("--- [PRODUCTION DEBUG] RAW ENVIRONMENT START ---", flush=True)
for k, v in os.environ.items():
    if any(x in k.upper() for x in ["REDIS", "DATABASE", "URL", "ENV", "OPENAI"]):
        env_v = str(v)
        masked = env_v
        if "@" in env_v:
            # Simple masking that avoids slicing if that's the issue
            parts = env_v.split("@")
            if len(parts) > 1:
                masked = "********@" + str(parts[1])
        elif len(env_v) > 20 and "sk-" in env_v:
            masked = env_v[:10] + "..." + env_v[-10:]
        print(f"DEBUG ENV: {k}={masked}", flush=True)
print(f"DEBUG .env file exists: {env_file_path.exists()}", flush=True)
print("--- [PRODUCTION DEBUG] RAW ENVIRONMENT END ---", flush=True)

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    PROJECT_NAME: str = "AYTME API"
    API_V1_STR: str = "/v1"
    # 🔐 SECRET_KEY MUST come from environment - NEVER hardcoded
    SECRET_KEY: SecretStr = Field(
        ...,  # Required field, no default
        description="JWT secret key (64+ chars random string from env only)"
    )
    SECRET_KEY_VERSION: int = Field(
        default=1,
        description="Version number for key rotation support"
    )
    
    # Frontend & URLs
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    API_BASE_URL: str = "http://localhost:8000"

    # Platform admin allowlist
    ADMIN_EMAILS: str = "aytme.admin@gmail.com,moesheacorp@gmail.com"
    ADMIN_DEFAULT_PASSWORD: str = Field(
        default="Admin123!",
        description="Default password for auto-seeded admin account"
    )
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost:5432/aytme"
    
    # Redis - FORCE REQUIRED IN PRODUCTION TO CATCH MISCONFIG
    REDIS_URL: str = Field(
        default="redis://CRITICAL_ERROR_MISSING_REDIS_URL:6379/0",
        description="Redis connection URL"
    )
    
    # LiveKit - Both API key and secret MUST come from environment
    LIVEKIT_API_KEY: str = Field(
        ...,
        description="LiveKit API key from environment"
    )
    LIVEKIT_API_SECRET: SecretStr = Field(
        ...,
        description="LiveKit API secret (64+ chars) from environment only"
    )
    LIVEKIT_URL: str = "http://localhost:7800"
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = None

    # TTS defaults and optional overrides
    TTS_DEFAULT_VOICE: str = "alloy"
    TTS_DEFAULT_SPEED: float = 0.88
    TTS_VOICE_MAP_JSON: str = ""
    TTS_SPEED_MAP_JSON: str = ""
    
    # S3 / Object Storage
    S3_BUCKET: str = "aytme-dev"
    S3_ENDPOINT: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    
    # SendGrid (legacy, kept for compatibility)
    SENDGRID_API_KEY: Optional[SecretStr] = Field(
        default=None,
        description="SendGrid API key for email delivery"
    )
    SENDGRID_FROM_EMAIL: Optional[str] = Field(
        default=None,
        description="From email address for notifications"
    )
    
    # SMTP (Gmail App Password) - preferred email provider (lightweight)
    SMTP_HOST: Optional[str] = Field(
        default=None,
        description="SMTP server host (e.g., smtp.gmail.com)"
    )
    SMTP_PORT: Optional[int] = Field(
        default=587,
        description="SMTP server port (use 587 for STARTTLS)"
    )
    SMTP_USER: Optional[str] = Field(
        default=None,
        description="SMTP username (email address)"
    )
    SMTP_PASSWORD: Optional[SecretStr] = Field(
        default=None,
        description="SMTP password (use Gmail App Password for Gmail accounts)"
    )
    SMTP_FROM_EMAIL: Optional[str] = Field(
        default=None,
        description="From email address used in the From header"
    )
    
    # Error Tracking - Sentry
    SENTRY_DSN: Optional[SecretStr] = Field(
        default=None,
        description="Sentry DSN for error tracking"
    )
    SENTRY_ENVIRONMENT: str = Field(
        default="development",
        description="Sentry environment"
    )
    SENTRY_TRACES_SAMPLE_RATE: float = Field(
        default=0.1,
        description="Sentry traces sample rate"
    )
    
    
    # PayPal Migration
    PAYPAL_CLIENT_ID: Optional[str] = Field(
        default="AZDMX64s-zbu1cwNBq7KPA07mKX91zSrawfEEUEViywiT0pyV1OM6XFGo6Uf0HKnnIhhB_P0tQwLN78I",
        description="PayPal client ID"
    )
    PAYPAL_SECRET: Optional[SecretStr] = Field(
        default=SecretStr("EB6ul8MND4Y5O9RPzRSMNVIei4vpLiLmUvPBIA9_HjK9FQuEOClSCpOR5wGDqAZZC4uT-Rr9TcwniKTD"),
        description="PayPal secret key"
    )
    PAYPAL_WEBHOOK_ID: Optional[str] = Field(
        default="8VB041613A188701J",
        description="PayPal webhook ID"
    )
    PAYPAL_ENV: str = Field(
        default="live",
        description="PayPal environment: sandbox or live"
    )

    @field_validator('PAYPAL_ENV')
    @classmethod
    def validate_paypal_env(cls, v: str) -> str:
        """Ensure PayPal environment is strictly sandbox or live."""
        v = v.lower()
        if v not in ["sandbox", "live"]:
            # If "test" is provided (legacy), map to "sandbox"
            if v == "test":
                return "sandbox"
            raise ValueError('PAYPAL_ENV must be "sandbox" or "live"')
        return v
    # AI Translation Pipeline Configuration
    AI_MIN_TOKEN_THRESHOLD: int = Field(
        default=2,
        description="Minimum token count for valid AI output"
    )
    AI_PREWARM_ENABLED: bool = Field(
        default=True,
        description="Whether to prewarm OpenAI engine on session start"
    )
    AI_OUTPUT_MAX_RETRY: int = Field(
        default=1,
        description="Max retries for invalid AI output per turn"
    )
    AI_DEDUP_WINDOW_SIZE: int = Field(
        default=100,
        description="Max entries in dedup hash set before pruning"
    )
    
    # Emulation
    EMULATE_STORAGE: bool = False
    
    # Environment Detection
    ENVIRONMENT: str = Field(
        default="development",
        description="Environment: development, staging, production"
    )
    
    # Security Headers
    ALLOWED_HOSTS: str = "localhost,127.0.0.1"
    
    model_config = SettingsConfigDict(
        env_file=env_file_config,  # Only load .env if it exists
        case_sensitive=False,
        extra="ignore",
        validate_default=True
    )
    
    @field_validator('SECRET_KEY')
    @classmethod
    def validate_secret_key(cls, v: SecretStr) -> SecretStr:
        """Ensure SECRET_KEY is strong enough for production."""
        secret_str = v.get_secret_value()
        if len(secret_str) < 32:
            raise ValueError('SECRET_KEY must be at least 32 characters')
        return v
    
    @field_validator('DATABASE_URL')
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Standardize DB URL for asyncpg and strip unsupported sslmode."""
        if not v:
            return v
        
        # asyncpg doesn't support sslmode=require or ssl=require in URL, it's passed via connect_args
        v = v.replace("?sslmode=require", "")
        v = v.replace("&sslmode=require", "")
        v = v.replace("?ssl=require", "")
        v = v.replace("&ssl=require", "")
        
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://") and "+asyncpg" not in v:
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v
    
    @field_validator('LIVEKIT_API_SECRET')
    @classmethod
    def validate_livekit_secret(cls, v: SecretStr) -> SecretStr:
        """Ensure LiveKit secret is provided."""
        secret_str = v.get_secret_value()
        if len(secret_str) < 20:
            raise ValueError('LIVEKIT_API_SECRET must be at least 20 characters')
        return v
    
    @field_validator('CORS_ORIGINS')
    @classmethod
    def parse_cors_origins(cls, v: str) -> str:
        """Validate CORS origins format."""
        if not v or not isinstance(v, str):
            raise ValueError('CORS_ORIGINS must be a comma-separated string')
        return v
    
    def get_cors_origins(self) -> List[str]:
        """Get properly formatted CORS origins list."""
        raw_origins = self.CORS_ORIGINS
        if not raw_origins:
            return []
        if isinstance(raw_origins, list):
            return list(raw_origins)
        return [origin.strip() for origin in str(raw_origins).split(',')]
    
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.ENVIRONMENT.lower() == "production"

    async def update_from_db(self, db):
        """Dynamic update from system_config table."""
        from sqlalchemy import select
        from app.models.models import SystemConfig
        try:
            result = await db.execute(select(SystemConfig))
            configs = result.scalars().all()
            for cfg in configs:
                if hasattr(self, cfg.key):
                    val = cfg.value
                    if val is None: continue
                    
                    # Handle type conversion if needed
                    attr = getattr(self, cfg.key)
                    if isinstance(attr, SecretStr):
                        setattr(self, cfg.key, SecretStr(val))
                    elif isinstance(attr, bool):
                        setattr(self, cfg.key, val.lower() == "true")
                    elif isinstance(attr, int):
                        setattr(self, cfg.key, int(val))
                    else:
                        setattr(self, cfg.key, val)
            logger.info("✓ Settings synchronized from database")
        except Exception as e:
            logger.error(f"Failed to sync settings from DB: {e}")
    
    def __init__(self, **data):
        super().__init__(**data)
        logger.info(f"✓ Configuration loaded for {self.ENVIRONMENT} environment")
        if self.is_production():
            logger.warning("⚠️  PRODUCTION MODE - Ensure all secrets from secure env vars only")
        
        # Log all loaded settings for debugging, masking sensitive ones
        logger.info("--- Loaded Settings ---")
        for key, value in self.model_dump().items():
            if isinstance(value, SecretStr):
                logger.info(f"  {key}=********")
            elif "KEY" in key.upper() or "SECRET" in key.upper() or "PASSWORD" in key.upper():
                logger.info(f"  {key}=********")
            elif "URL" in key.upper() and isinstance(value, str):
                v_str = str(value)
                masked_url = v_str
                if "@" in v_str:
                    u_parts = v_str.split("@")
                    if len(u_parts) > 1:
                        masked_url = "********@" + str(u_parts[1])
                logger.info(f"  {key}={masked_url}")
            else:
                logger.info(f"  {key}={value}")
        logger.info("-----------------------")

try:
    settings = Settings()
except Exception:
    logger.critical(f"❌ FAILED TO LOAD SETTINGS: {traceback.format_exc()}")
    raise
