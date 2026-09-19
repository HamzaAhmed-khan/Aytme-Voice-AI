import asyncio
import sys
import os
from uuid import UUID

# In Docker, 'app' package is already in the search path if we run from /app
# but we might be running it in a way that needs help
sys.path.append("/app")

try:
    from app.core.database import SessionLocal
    from app.models.models import Room
except ImportError:
    from core.database import SessionLocal
    from models.models import Room

from sqlalchemy import select

async def get_room():
    async with SessionLocal() as db:
        res = await db.execute(select(Room).limit(1))
        room = res.scalars().first()
        if room:
            print(f"ROOM_ID={room.id}")
            print(f"ORG_ID={room.org_id}")
        else:
            print("NO_ROOMS")

if __name__ == "__main__":
    asyncio.run(get_room())
