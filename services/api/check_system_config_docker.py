import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:password@db:5432/aytme"

async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT key, value FROM system_config"))
        for r in res:
            print(f"KEY: {r[0]}, VAL: {r[1]}")

if __name__ == "__main__":
    asyncio.run(main())
