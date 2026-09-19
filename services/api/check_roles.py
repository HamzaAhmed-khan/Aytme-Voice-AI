import sys
import asyncio

# Fix path for imports
sys.path.append("/app")

from app.core.database import SessionLocal
from app.models.models import User
from sqlalchemy import select

async def main():
    async with SessionLocal() as session:
        result = await session.execute(select(User.email, User.role))
        for email, role in result:
            print(f"{email}: '{role}'")

if __name__ == "__main__":
    asyncio.run(main())
