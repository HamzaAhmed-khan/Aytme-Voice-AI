import asyncio
import sys
import os

# Add the directory containing the 'app' package to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from sqlalchemy import select
from app.core.database import SessionLocal
from app.models.models import User

async def list_admins():
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.role == "admin"))
        admins = result.scalars().all()
        for admin in admins:
            print(f"Admin Email: {admin.email}, Full Name: {admin.full_name}, Is Active: {admin.is_active}")

if __name__ == "__main__":
    asyncio.run(list_admins())
