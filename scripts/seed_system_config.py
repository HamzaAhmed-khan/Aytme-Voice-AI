import asyncio
import sys
import os
from sqlalchemy import select, insert, update
from sqlalchemy.ext.asyncio import AsyncSession

# Add current dir to sys.path
sys.path.append(os.getcwd())

from app.core.database import get_db, engine
from app.models.models import SystemConfig
from app.core.config import settings

async def seed_config():
    async for db in get_db():
        configs = [
            {"key": "PROJECT_NAME", "value": settings.PROJECT_NAME, "category": "general", "description": "Name of the platform"},
            {"key": "FRONTEND_URL", "value": settings.FRONTEND_URL, "category": "general", "description": "URL of the React frontend"},
            {"key": "ENVIRONMENT", "value": settings.ENVIRONMENT, "category": "general", "description": "System environment (development/production)"},
            
            # Email
            {"key": "SENDGRID_API_KEY", "value": settings.SENDGRID_API_KEY.get_secret_value() if settings.SENDGRID_API_KEY else "", "category": "email", "is_secret": True, "description": "API Key for SendGrid"},
            {"key": "SENDGRID_FROM_EMAIL", "value": settings.SENDGRID_FROM_EMAIL or "", "category": "email", "description": "Sender email address"},
            {"key": "SMTP_HOST", "value": "", "category": "email", "description": "SMTP Host (fallback)"},
            {"key": "SMTP_PORT", "value": "587", "category": "email", "description": "SMTP Port"},
            {"key": "SMTP_USER", "value": "", "category": "email", "description": "SMTP Username"},
            {"key": "SMTP_PASSWORD", "value": "", "category": "email", "is_secret": True, "description": "SMTP Password"},
            
            # AI & LiveKit
            {"key": "OPENAI_API_KEY", "value": settings.OPENAI_API_KEY or "", "category": "ai", "is_secret": True, "description": "OpenAI API Key for translation"},
            {"key": "TTS_DEFAULT_VOICE", "value": settings.TTS_DEFAULT_VOICE, "category": "ai", "description": "Default TTS voice"},
            {"key": "TTS_DEFAULT_SPEED", "value": str(settings.TTS_DEFAULT_SPEED), "category": "ai", "description": "Default TTS speed"},
            {"key": "TTS_VOICE_MAP_JSON", "value": settings.TTS_VOICE_MAP_JSON or "", "category": "ai", "description": "Optional JSON map: lang -> voice"},
            {"key": "TTS_SPEED_MAP_JSON", "value": settings.TTS_SPEED_MAP_JSON or "", "category": "ai", "description": "Optional JSON map: lang -> speed"},
            {"key": "LIVEKIT_URL", "value": settings.LIVEKIT_URL, "category": "ai", "description": "LiveKit Server URL"},
            {"key": "LIVEKIT_API_KEY", "value": settings.LIVEKIT_API_KEY, "category": "ai", "description": "LiveKit API Key"},
            {"key": "LIVEKIT_API_SECRET", "value": settings.LIVEKIT_API_SECRET.get_secret_value() if settings.LIVEKIT_API_SECRET else "", "category": "ai", "is_secret": True, "description": "LiveKit API Secret"},

            # Admin
            {"key": "ADMIN_EMAILS", "value": settings.ADMIN_EMAILS, "category": "general", "description": "Comma-separated admin allowlist"},
            
            # Storage
            {"key": "S3_BUCKET", "value": settings.S3_BUCKET, "category": "storage", "description": "S3 Bucket name for transcripts/audio"},
            {"key": "S3_ENDPOINT", "value": settings.S3_ENDPOINT or "", "category": "storage", "description": "S3 Endpoint URL"},
            {"key": "S3_ACCESS_KEY", "value": settings.S3_ACCESS_KEY or "", "category": "storage", "description": "S3 Access Key"},
            {"key": "S3_SECRET_KEY", "value": settings.S3_SECRET_KEY or "", "category": "storage", "is_secret": True, "description": "S3 Secret Key"},
            
            # Billing (PayPal)
            {"key": "PAYPAL_CLIENT_ID", "value": settings.PAYPAL_CLIENT_ID or "", "category": "billing", "description": "PayPal Client ID"},
            {"key": "PAYPAL_SECRET", "value": settings.PAYPAL_SECRET.get_secret_value() if settings.PAYPAL_SECRET else "", "category": "billing", "is_secret": True, "description": "PayPal Secret Key"},
            {"key": "PAYPAL_WEBHOOK_ID", "value": settings.PAYPAL_WEBHOOK_ID or "", "category": "billing", "description": "PayPal Webhook ID"},
            {"key": "PAYPAL_ENV", "value": settings.PAYPAL_ENV or "sandbox", "category": "billing", "description": "PayPal Environment (sandbox/live)"},
        ]
        
        for cfg in configs:
            # Check if exists
            stmt = select(SystemConfig).where(SystemConfig.key == cfg["key"])
            existing = (await db.execute(stmt)).scalars().first()
            if not existing:
                await db.execute(insert(SystemConfig).values(**cfg))
                print(f"Inserted: {cfg['key']}")
            else:
                print(f"Exists: {cfg['key']}")
        
        await db.commit()
        break

if __name__ == "__main__":
    asyncio.run(seed_config())
