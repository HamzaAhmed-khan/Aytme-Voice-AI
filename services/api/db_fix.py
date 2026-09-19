import asyncio
from app.core.database import SessionLocal
from app.models.models import Room
from sqlalchemy import select, update

async def fix():
    print("Fixing room modes...")
    async with SessionLocal() as s:
        r = await s.execute(select(Room))
        rooms = r.scalars().all()
        for rm in rooms:
            m = rm.mode
            n = rm.name.lower()
            nm = 'broadcast' if 'broadcast' in n else ('talk_together' if 'group' in n or 'together' in n else 'conversation')
            if nm != m:
                print(f"Updating {rm.name}: {m} -> {nm}")
                await s.execute(update(Room).where(Room.id == rm.id).values(mode=nm))
        await s.commit()
    print("Done")

if __name__ == "__main__":
    asyncio.run(fix())
