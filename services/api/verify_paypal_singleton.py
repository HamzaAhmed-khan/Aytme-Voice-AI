import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings
from services.billing.paypal_service import paypal_client
import os

DATABASE_URL = "postgresql+asyncpg://postgres:password@db:5432/aytme"

async def main():
    engine = create_async_engine(DATABASE_URL)
    Session = async_sessionmaker(engine)
    
    # 1. Simulate lifespan sync
    async with Session() as session:
        print("Syncing settings from DB...")
        await settings.update_from_db(session)
    
    # 2. Check what the singleton paypal_client sees NOW
    print("\n--- PayPal Settings Verification ---")
    
    # We need to trigger get_access_token or just check if it raises "not configured"
    # Or just check the settings directly as paypal_client now uses them dynamically
    client_id = settings.PAYPAL_CLIENT_ID
    secret = settings.PAYPAL_SECRET.get_secret_value() if settings.PAYPAL_SECRET else None
    
    print(f"Settings PAYPAL_CLIENT_ID: {client_id[:10] if client_id else 'None'}...")
    print(f"Settings PAYPAL_SECRET: {'[SET]' if secret else '[MISSING]'}")
    
    # Test property
    print(f"PayPalClient Base URL: {paypal_client.base_url}")
    
    try:
        # This should now get past the credential check
        # We don't want to actually call PayPal if we can avoid it, 
        # but let's see if it gets to the 'auth_str' part
        if not client_id or not secret:
            print("❌ FAILURE: Credentials still missing in settings!")
        else:
            print("✅ SUCCESS: Credentials successfully synchronized!")
            
    except Exception as e:
        print(f"❌ Error during verification: {e}")

if __name__ == "__main__":
    asyncio.run(main())
