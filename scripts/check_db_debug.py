import asyncio
import os
import sys
sys.path.append(os.getcwd())
from sqlalchemy import text
from app.core.database import get_db

async def check_db():
    async for db in get_db():
        # Check tables
        tables = ["users", "organizations", "subscriptions", "worker_nodes", "system_config", "audit_logs"]
        for table in tables:
            try:
                result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = result.scalar()
                print(f"Table '{table}': EXISTS (count: {count})")
                
                # Check columns for worker_nodes and system_config
                if table in ["worker_nodes", "system_config"]:
                    cols = await db.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}'"))
                    print(f"Columns for '{table}': {[(r[0], r[1]) for r in cols]}")
            except Exception as e:
                print(f"Table '{table}': ERROR ({str(e)})")
        break

if __name__ == "__main__":
    asyncio.run(check_db())
