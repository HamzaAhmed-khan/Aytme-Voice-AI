import asyncio
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Add app to path
sys.path.append(os.getcwd())

from app.core.config import settings
from app.models.models import Room, User, Organization

async def audit():
    uri = settings.DATABASE_URL
    if not uri:
        print("DATABASE_URL not found")
        return
        
    engine = create_async_engine(uri)
    
    async with engine.connect() as conn:
        tables = [
            ('rooms', Room),
            ('users', User),
            ('organizations', Organization)
        ]
        
        for table_name, model in tables:
            print(f"\n--- Auditing {table_name.capitalize()} Table ---")
            try:
                # Query information_schema for columns
                res = await conn.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}'"))
                db_cols = set([r[0] for r in res.all()])
                model_cols = set(model.__mapper__.columns.keys())
                
                missing = model_cols - db_cols
                if missing:
                    print(f"  [MISSING IN DB]: {missing}")
                else:
                    print(f"  [OK] - All {len(model_cols)} columns present in DB")
                
            except Exception as e:
                print(f"  Error: {e}")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(audit())
