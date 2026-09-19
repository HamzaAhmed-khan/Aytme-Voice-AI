import asyncio
import sys
import os
from uuid import UUID

sys.path.append("/app")

try:
    from app.core.database import SessionLocal
    from app.models.models import UsageRecord
except ImportError:
    from core.database import SessionLocal
    from models.models import UsageRecord

from sqlalchemy import select, func

async def check_usage():
    async with SessionLocal() as db:
        res = await db.execute(select(func.count(UsageRecord.id)))
        count = res.scalar()
        print(f"TOTAL_USAGE_RECORDS={count}")
        
        # Latest records
        res = await db.execute(select(UsageRecord).order_by(UsageRecord.recorded_at.desc()).limit(5))
        records = res.scalars().all()
        for r in records:
            print(f"ID={r.id} ORG={r.org_id} ROOM={r.room_id} MIN={r.minutes_used} AT={r.recorded_at}")

if __name__ == "__main__":
    asyncio.run(check_usage())
