import asyncio
import os
import sys
from sqlalchemy import select

# Add project root to sys.path
sys.path.append(os.getcwd())

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.models import User

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "aytme.admin@gmail.com").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

if not ADMIN_PASSWORD:
    print("Missing ADMIN_PASSWORD. Set it (e.g., Admin123!) and retry.")
    sys.exit(1)

async def seed_admin():
    async for db in get_db():
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        user = result.scalar_one_or_none()
        if user:
            user.hashed_password = get_password_hash(ADMIN_PASSWORD)
            user.role = "admin"
            user.is_active = True
            user.is_verified = True
            await db.commit()
            print(f"Updated admin user: {ADMIN_EMAIL}")
        else:
            user = User(
                email=ADMIN_EMAIL,
                hashed_password=get_password_hash(ADMIN_PASSWORD),
                full_name="Admin",
                role="admin",
                is_active=True,
                is_verified=True,
            )
            db.add(user)
            await db.commit()
            print(f"Created admin user: {ADMIN_EMAIL}")
        break

if __name__ == "__main__":
    asyncio.run(seed_admin())
