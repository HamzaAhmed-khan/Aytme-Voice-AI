import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:password@db:5432/aytme"

async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        print("\n--- Current Plans ---")
        res = await conn.execute(text("SELECT id, name, is_active FROM plans"))
        for r in res:
            print(f"ID: {r[0]}, Name: {r[1]}, Active: {r[2]}")
            
        print("\n--- Current Configuration Overrides ---")
        res = await conn.execute(text("SELECT key, value FROM system_config WHERE key LIKE 'PAYPAL_%'"))
        for r in res:
            masked = r[1][:8] + "..." if r[1] else "None"
            print(f"KEY: {r[0]}, VAL: {masked}")

if __name__ == "__main__":
    asyncio.run(main())
