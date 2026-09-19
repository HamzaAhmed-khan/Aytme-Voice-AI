import asyncio
import os
import sys
from sqlalchemy import select, update, delete

# Ensure project root is importable
sys.path.append(os.getcwd())

from app.core.database import get_db
from app.models.models import User, Organization, Room, BillingEvent, Participant, OrgMember

TARGET_EMAIL = os.getenv("TARGET_EMAIL", "admin@aytme.io").strip().lower()

async def delete_user():
    async for db in get_db():
        result = await db.execute(select(User).where(User.email == TARGET_EMAIL))
        user = result.scalars().first()
        if not user:
            print(f"User not found: {TARGET_EMAIL}")
            return
        uid = user.id
        # Reassign or clear foreign keys that reference the user
        await db.execute(update(Organization).where(Organization.owner_id == uid).values(owner_id=None))
        await db.execute(update(Room).where(Room.owner_id == uid).values(owner_id=None))
        await db.execute(update(BillingEvent).where(BillingEvent.user_id == uid).values(user_id=None))
        await db.execute(update(Participant).where(Participant.user_id == uid).values(user_id=None))
        await db.execute(delete(OrgMember).where(OrgMember.user_id == uid))
        await db.execute(delete(User).where(User.id == uid))
        await db.commit()
        print(f"Deleted user and cleaned references for: {TARGET_EMAIL}")

if __name__ == "__main__":
    asyncio.run(delete_user())
