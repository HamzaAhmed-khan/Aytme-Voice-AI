import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:password@localhost:5432/aytme"
engine = create_async_engine(DATABASE_URL)

async def main():
    async with engine.connect() as conn:
        res = await conn.execute(text('SELECT id, name, paypal_plan_id FROM plans'))
        for r in res:
            print(f"ID: {r.id}, Name: {r.name}, PayPal: {r.paypal_plan_id}")

if __name__ == "__main__":
    asyncio.run(main())
