import asyncio
import sys
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select
from app.core.database import SessionLocal, engine
from app.models.models import User, Organization, OrgMember, Quota, Subscription, Plan
from app.core.security import get_password_hash
from app.core.config import settings

async def create_admin(email: str, password: str, full_name: str):
    async with SessionLocal() as session:
        # 1. Check if user already exists
        result = await session.execute(select(User).where(User.email == email))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print(f"User {email} already exists. Updating to admin role...")
            existing_user.role = "admin"
            existing_user.is_active = True
            existing_user.is_verified = True
            existing_user.hashed_password = get_password_hash(password)
            user = existing_user
        else:
            print(f"Creating new admin user: {email}")
            user = User(
                email=email,
                hashed_password=get_password_hash(password),
                full_name=full_name,
                role="admin",
                is_active=True,
                is_verified=True
            )
            session.add(user)
            await session.flush()  # To get user.id

        # 2. Check if they have an organization
        result = await session.execute(select(Organization).where(Organization.owner_id == user.id))
        org = result.scalar_one_or_none()
        
        if not org:
            print(f"Creating default organization for {email}")
            org = Organization(
                name=f"{full_name}'s Org",
                slug=f"admin-{str(uuid.uuid4())[:8]}",
                owner_id=user.id,
                plan="pro"
            )
            session.add(org)
            await session.flush()

            # Add to org_members
            member = OrgMember(org_id=org.id, user_id=user.id, role="admin")
            session.add(member)

            # Add Quota
            quota = Quota(
                org_id=org.id,
                rooms_month=1000,
                minutes_month=10000
            )
            session.add(quota)

            # Add Subscription (linked to Pro plan)
            result = await session.execute(select(Plan).where(Plan.name == "Pro"))
            plan = result.scalar_one_or_none()
            if not plan:
                # Create a default pro plan if missing
                plan = Plan(
                    name="Pro",
                    description="Pro level access",
                    price_monthly=4.99,
                    minutes_included=1000,
                    max_rooms=50
                )
                session.add(plan)
                await session.flush()
            
            now = datetime.utcnow()
            sub = Subscription(
                org_id=org.id,
                plan_id=plan.id,
                status="active",
                current_period_start=now,
                current_period_end=now + timedelta(days=30)
            )
            session.add(sub)

        await session.commit()
        print(f"Successfully created/updated admin user {email}")
        print(f"Org ID: {org.id}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python create_admin.py <email> <password> [full_name]")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    full_name = sys.argv[3] if len(sys.argv) > 3 else "System Admin"
    
    asyncio.run(create_admin(email, password, full_name))
