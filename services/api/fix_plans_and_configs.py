import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
import os

DATABASE_URL = "postgresql+asyncpg://postgres:password@db:5432/aytme"

async def main():
    engine = create_async_engine(DATABASE_URL)
    Session = async_sessionmaker(engine)
    
    async with Session() as session:
        # 1. Remove Enterprise Plan
        print("Removing Enterprise plan...")
        await session.execute(text("DELETE FROM plans WHERE name ILIKE '%Enterprise%'"))
        
        # 2. Check and Fix system_config for PayPal
        print("Checking system_config for PayPal overrides...")
        res = await session.execute(text("SELECT key, value FROM system_config WHERE key LIKE 'PAYPAL_%'"))
        overrides = res.fetchall()
        
        for key, val in overrides:
            print(f"  Found DB Override: {key} = {'[SET]' if val else '[EMPTY]'}")
            if not val:
                print(f"  Deleting empty override for {key} to let .env take precedence...")
                await session.execute(text(f"DELETE FROM system_config WHERE key = '{key}'"))
        
        await session.commit()
    
    # 3. Final Verification of Plans
    print("\nCurrent Plans in DB:")
    async with engine.connect() as conn:
        res = await conn.execute(text('SELECT name, paypal_plan_id FROM plans'))
        for r in res:
            print(f"  Plan: {r[0]}, PayPal ID: {r[1]}")
            
if __name__ == "__main__":
    asyncio.run(main())
