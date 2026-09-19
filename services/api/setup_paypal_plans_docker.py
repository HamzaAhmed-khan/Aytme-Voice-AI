import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

# Connect to the database inside the docker network
DATABASE_URL = "postgresql+asyncpg://postgres:password@db:5432/aytme"

async def main():
    engine = create_async_engine(DATABASE_URL)
    Session = async_sessionmaker(engine)
    
    # We will use the exact Plan IDs you already created in PayPal
    pro_plan_id = "P-76728989N2160835VNHJM2HA"
    ent_plan_id = "P-42848989N2160835VNHJM2XX"
    
    async with Session() as session:
        # Update Pro plan
        print("Updating Pro plan with PayPal ID...")
        await session.execute(text(f"UPDATE plans SET paypal_plan_id = '{pro_plan_id}' WHERE name ILIKE '%Pro%'"))
        
        await session.commit()
    
    # Verify
    print("\nVerification (Docker DB):")
    async with engine.connect() as conn:
        res = await conn.execute(text('SELECT id, name, paypal_plan_id, is_active FROM plans'))
        for r in res:
            print(f"ID: {r[0]}, Name: {r[1]}, PayPal: {r[2]}, Active: {r[3]}")
            
if __name__ == "__main__":
    asyncio.run(main())
