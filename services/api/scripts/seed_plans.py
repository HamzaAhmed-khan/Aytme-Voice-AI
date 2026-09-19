import asyncio
import sys
import os
from uuid import UUID
from decimal import Decimal

# Add the directory containing the 'app' package to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from app.core.database import SessionLocal
from app.models.models import Plan, Subscription
from sqlalchemy import select, update, delete

async def seed_plans():
    plans_data = [
        {
            "id": UUID("f47ac10b-58cc-4372-a567-0e02b2c3d482"),
            "name": "Starter",
            "description": "Audio-only starter plan.",
            "price_monthly": Decimal("4.99"),
            "minutes_included": 250,
            "overage_rate_per_min": Decimal("0.05"),
            "max_rooms": 2,
            "max_participants": 25,
            "features": {"rooms": 2, "support": "Community", "video": False, "broadcast": False, "description": "Audio only"},
            "is_active": True
        },
        {
            "id": UUID("f47ac10b-58cc-4372-a567-0e02b2c3d480"),
            "name": "Pro",
            "description": "Video and conversations.",
            "price_monthly": Decimal("9.99"),
            "minutes_included": 1000,
            "overage_rate_per_min": Decimal("0.03"),
            "max_rooms": 10,
            "max_participants": 50,
            "features": {"rooms": 10, "support": "Priority Email", "video": True, "broadcast": False, "description": "Video, conversations"},
            "is_active": True
        },
        {
            "id": UUID("f47ac10b-58cc-4372-a567-0e02b2c3d483"),
            "name": "Premium",
            "description": "Broadcast, full features.",
            "price_monthly": Decimal("19.99"),
            "minutes_included": 3000,
            "overage_rate_per_min": Decimal("0.02"),
            "max_rooms": 50,
            "max_participants": 200,
            "features": {"rooms": 50, "support": "Priority", "video": True, "broadcast": True, "description": "Broadcast, full features"},
            "is_active": True
        }
    ]

    async with SessionLocal() as db:
        for plan_info in plans_data:
            # Check if plan with target ID exists
            stmt = select(Plan).where(Plan.id == plan_info["id"])
            res = await db.execute(stmt)
            plan_by_id = res.scalars().first()
            
            # Check if plan with target Name exists
            stmt = select(Plan).where(Plan.name == plan_info["name"])
            res = await db.execute(stmt)
            plan_by_name = res.scalars().first()

            if plan_by_id and plan_by_name and plan_by_id.id == plan_by_name.id:
                print(f"Plan {plan_info['name']} already exists with correct ID. Updating fields...")
                for k, v in plan_info.items():
                    setattr(plan_by_id, k, v)
                continue

            # Case: Name exists but with different ID
            if plan_by_name and plan_by_name.id != plan_info["id"]:
                print(f"Plan {plan_info['name']} exists with WRONG ID ({plan_by_name.id}). Rewiring...")
                
                # 1. Rename old plan to avoid unique constraint
                old_id = plan_by_name.id
                plan_by_name.name = f"{plan_info['name']}_OLD_{old_id}"
                await db.flush()
                
                # 2. Create new plan with correct ID
                print(f"   Creating new {plan_info['name']} plan with ID {plan_info['id']}")
                new_plan = Plan(**plan_info)
                db.add(new_plan)
                await db.flush()
                
                # 3. Update all subscriptions to point to new ID
                sub_count = 0
                sub_stmt = select(Subscription).where(Subscription.plan_id == old_id)
                subs = (await db.execute(sub_stmt)).scalars().all()
                for sub in subs:
                    sub.plan_id = plan_info["id"]
                    sub_count += 1
                
                if sub_count:
                    print(f"   Updated {sub_count} subscriptions to new plan ID")
                
                # 4. Delete old plan
                await db.delete(plan_by_name)
                await db.flush()
                print(f"   Deleted old plan {old_id}")
                
            elif plan_by_id:
                # ID exists but name is different? (Shouldn't happen with our logic but for safety)
                print(f"Plan ID {plan_info['id']} exists with different name ({plan_by_id.name}). Updating...")
                for k, v in plan_info.items():
                    setattr(plan_by_id, k, v)
            else:
                # Neither ID nor Name exists
                print(f"Creating new plan {plan_info['name']} with ID {plan_info['id']}")
                db.add(Plan(**plan_info))
                
        await db.commit()
        print("Seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_plans())
