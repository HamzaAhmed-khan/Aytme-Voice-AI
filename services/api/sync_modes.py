import asyncio
import sys
import os

# Add the project root to sys.path to allow imports from app
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.models import Room
from sqlalchemy import select, update

async def sync_room_modes():
    print("Starting DB synchronization...")
    async with SessionLocal() as session:
        result = await session.execute(select(Room))
        rooms = result.scalars().all()
        
        count = 0
        for room in rooms:
            old_mode = room.mode
            new_mode = old_mode
            name_lower = room.name.lower()
            
            # Logic to derive mode from name if it was previously conversation/null
            if "broadcast" in name_lower:
                new_mode = "broadcast"
            elif "group" in name_lower or "together" in name_lower:
                new_mode = "talk_together"
            else:
                new_mode = "conversation"
            
            if new_mode != old_mode:
                print(f"Updating room '{room.name}' from '{old_mode}' to '{new_mode}'")
                await session.execute(
                    update(Room)
                    .where(Room.id == room.id)
                    .values(mode=new_mode)
                )
                count += 1
        
        await session.commit()
        print(f"Successfully updated {count} rooms.")

if __name__ == "__main__":
    asyncio.run(sync_room_modes())
