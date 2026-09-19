from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

import logging
import ssl as ssl_module
import sys

logger = logging.getLogger(__name__)

try:
    # sslmode=require is handled here for asyncpg
    connect_args = {}
    db_url = settings.DATABASE_URL
    
    # Enable SSL if production OR if the URL explicitly requests it
    if settings.ENVIRONMENT == "production" or "ssl=require" in db_url or "sslmode=require" in db_url:
        # asyncpg requires an ssl.SSLContext, not a string
        ssl_ctx = ssl_module.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl_module.CERT_NONE
        connect_args["ssl"] = ssl_ctx
        logger.info("🔒 SSL enabled for database connection")
    
    # Strip ssl params from URL since they're handled via connect_args
    clean_url = db_url.replace("?ssl=require", "").replace("&ssl=require", "")
    clean_url = clean_url.replace("?sslmode=require", "").replace("&sslmode=require", "")

    engine = create_async_engine(
        clean_url,
        pool_pre_ping=True,
        connect_args=connect_args
    )
    logger.info("✓ Database engine created successfully")
except Exception as e:
    logger.critical(f"❌ Failed to create database engine: {e}")
    # Don't exit here, let the app try to start so we can see the error in logs

SessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db():
    session = SessionLocal()
    try:
        yield session
    finally:
        await session.close()
