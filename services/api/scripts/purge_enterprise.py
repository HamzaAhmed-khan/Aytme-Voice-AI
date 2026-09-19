import asyncio
import sys
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Connect to the database using localhost (available when running from Windows host)
DATABASE_URL = "postgresql+asyncpg://postgres:password@localhost:5432/aytme"

async def purge_enterprise():
    engine = create_async_engine(DATABASE_URL)
    Session = async_sessionmaker(engine)
    
    async with Session() as session:
        print("Searching for 'Enterprise' plan and subscriptions...")
        
        try:
            # 1. Find the plan ID
            res = await session.execute(text("SELECT id, name FROM plans WHERE name ILIKE '%Enterprise%'"))
            plans = res.all()
            
            if not plans:
                print("No 'Enterprise' plans found in the database. System is already clean.")
                return

            for p_id, p_name in plans:
                print(f"Found plan: {p_name} ({p_id})")
                
                # 2. Re-assign or delete subscriptions linked to this plan
                res = await session.execute(text(f"DELETE FROM subscriptions WHERE plan_id = '{p_id}'"))
                print(f"   Deleted {res.rowcount} subscriptions.")
                
                # 3. Delete the plan itself
                await session.execute(text(f"DELETE FROM plans WHERE id = '{p_id}'"))
                print(f"   Deleted plan {p_name}.")
                
            await session.commit()
            print("Enterprise plan purge completed successfully.")
        except Exception as e:
            print(f"An error occurred: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(purge_enterprise())
