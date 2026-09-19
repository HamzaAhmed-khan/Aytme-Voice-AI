"""Recalibrate plan IDs to match application constants

Revision ID: 005_recalibrate_plan_ids
Revises: 42bdbeb33339
Create Date: 2026-03-17 01:45:00
"""
from alembic import op
import sqlalchemy as sa
from uuid import UUID

# revision identifiers
revision = '005_recalibrate_plan_ids'
down_revision = '42bdbeb33339'
branch_labels = None
depends_on = None

def upgrade():
    # Plan mapping (ID, Name, Description, price, minutes, overage, rooms, participants, features_json)
    plans = [
        ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Free', 'Free tier for testing', '0.00', 60, '0.10', 2, 5, '{"overage_allowed": false, "retention": "24h", "support": "Community"}'),
        ('f47ac10b-58cc-4372-a567-0e02b2c3d480', 'Pro', 'Professional plan', '29.00', 1000, '0.05', 50, 25, '{"overage_allowed": true, "retention": "30 days", "support": "Priority Email"}'),
        ('f47ac10b-58cc-4372-a567-0e02b2c3d481', 'Enterprise', 'Enterprise plan with unlimited usage', '199.00', 10000, '0.03', 999, 999, '{"overage_allowed": true, "retention": "1 year", "support": "Dedicated SLA"}')
    ]
    
    for correct_id, name, desc, price, mins, overage, rooms, parts, features in plans:
        # Move any subscriptions pointing to "wrong" ID of this plan name to the "correct" ID
        # Using native SQL to avoid driver-specific UUID vs String issues in raw op.execute
        
        # 1. Update subscriptions
        op.execute(f"""
            UPDATE subscriptions 
            SET plan_id = '{correct_id}'::uuid 
            WHERE plan_id IN (SELECT id FROM plans WHERE name = '{name}' AND id != '{correct_id}'::uuid)
        """)
        
        # 2. Delete the old "wrong" plan entries
        op.execute(f"""
            DELETE FROM plans 
            WHERE name = '{name}' AND id != '{correct_id}'::uuid
        """)
        
        # 3. Ensure the "correct" plan exists
        op.execute(f"""
            INSERT INTO plans (id, name, description, price_monthly, minutes_included, overage_rate_per_min, max_rooms, max_participants, features, is_active, created_at)
            VALUES (
                '{correct_id}'::uuid, 
                '{name}', 
                '{desc}', 
                {price}, 
                {mins}, 
                {overage}, 
                {rooms}, 
                {parts}, 
                '{features}'::jsonb, 
                true, 
                now()
            )
            ON CONFLICT (id) DO UPDATE SET 
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price_monthly = EXCLUDED.price_monthly,
                minutes_included = EXCLUDED.minutes_included,
                overage_rate_per_min = EXCLUDED.overage_rate_per_min,
                max_rooms = EXCLUDED.max_rooms,
                max_participants = EXCLUDED.max_participants,
                features = EXCLUDED.features
        """)

def downgrade():
    pass
