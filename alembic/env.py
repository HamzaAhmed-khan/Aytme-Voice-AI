import asyncio
from logging.config import fileConfig

from sqlalchemy import pool, text as sa_text
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import models and settings
from app.core.config import settings
from app.models.models import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Overwrite sqlalchemy.url with the one from settings
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    # Widen alembic_version.version_num (default is VARCHAR(32), too short for long revision IDs)
    try:
        connection.execute(sa.text(
            "DO $$ BEGIN "
            "IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='alembic_version') THEN "
            "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255); "
            "END IF; "
            "END $$"
        ))
    except Exception:
        pass  # Safe to ignore — table may not exist on first run

    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    
    # 🔒 Handle SSL for Production (Matches services/api/core/database.py)
    import ssl as ssl_module
    connect_args = {}
    db_url = settings.DATABASE_URL
    
    if settings.ENVIRONMENT == "production" or "ssl=require" in db_url or "sslmode=require" in db_url:
        ssl_ctx = ssl_module.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl_module.CERT_NONE
        connect_args["ssl"] = ssl_ctx
    
    # Strip ssl params from URL
    clean_url = db_url.replace("?ssl=require", "").replace("&ssl=require", "")
    clean_url = clean_url.replace("?sslmode=require", "").replace("&sslmode=require", "")
    
    # Override the sqlalchemy.url with the clean URL
    config.set_main_option("sqlalchemy.url", clean_url)

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
