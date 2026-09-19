import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:password@db:5432/aytme"

async def main():
    engine = create_async_engine(DATABASE_URL)
    Session = async_sessionmaker(engine)
    
    configs = {
        "PAYPAL_CLIENT_ID": "AZDMX64s-zbu1cwNBq7KPA07mKX91zSrawfEEUEViywiT0pyV1OM6XFGo6Uf0HKnnIhhB_P0tQwLN78I",
        "PAYPAL_SECRET": "EB6ul8MND4Y5O9RPzRSMNVIei4vpLiLmUvPBIA9_HjK9FQuEOClSCpOR5wGDqAZZC4uT-Rr9TcwniKTD",
        "PAYPAL_WEBHOOK_ID": "8VB041613A188701J",
        "PAYPAL_ENV": "live"
    }
    
    async with Session() as session:
        print("Injecting PayPal credentials into system_config...")
        for key, val in configs.items():
            # Upsert logic
            await session.execute(text(f"DELETE FROM system_config WHERE key = '{key}'"))
            await session.execute(text(f"""
                INSERT INTO system_config (key, value, category, is_secret, updated_at)
                VALUES ('{key}', '{val}', 'billing', {'true' if 'SECRET' in key else 'false'}, NOW())
            """))
        
        await session.commit()
    
    print("\nVerification (DB Config):")
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT key, value FROM system_config WHERE category = 'billing'"))
        for r in res:
            masked = r[1][:5] + "..." if r[1] else "None"
            print(f"  {r[0]}: {masked}")
            
if __name__ == "__main__":
    asyncio.run(main())
