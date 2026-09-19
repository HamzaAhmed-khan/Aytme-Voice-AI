import asyncio
from uuid import uuid4
from app.core.database import SessionLocal
from app.models.models import Room

async def test():
    async with SessionLocal() as db:
        room = Room(
            id=uuid4(),
            name=f'verify_fix_{uuid4().hex[:4]}',
            owner_id='2b014b72-1b80-46f6-a078-81250473a487',
            org_id='cb8734b3-7af7-4fba-9a76-422fe018fb59',
            livekit_room_id=f'verify_{uuid4().hex[:8]}',
            status='pending',
            target_langs=['en', 'es']
        )
        db.add(room)
        await db.commit()
        print(f"Success! Created room with ID: {room.id}")

if __name__ == "__main__":
    asyncio.run(test())
