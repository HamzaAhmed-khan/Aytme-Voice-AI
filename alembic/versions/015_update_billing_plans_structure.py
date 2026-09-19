"""Update billing plans to Starter/Pro/Premium

Revision ID: 015_update_billing_plans_structure
Revises: 014_add_discount_codes_and_feature_flags
Create Date: 2026-04-05 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '015_update_billing_plans_structure'
down_revision: Union[str, Sequence[str], None] = '014_add_discount_codes_and_feature_flags'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Connect to the database and update plans
    connection = op.get_bind()
    
    # Deactivate ALL old plans first to start clean
    connection.execute(sa.text("""
        UPDATE plans SET is_active = false WHERE is_active = true
    """))
    
    # Update or create Starter plan ($4.99, 250 mins, 2 sessions)
    connection.execute(sa.text("""
        INSERT INTO plans (id, name, description, price_monthly, minutes_included, max_rooms, max_participants, overage_rate_per_min, features, is_active, created_at)
        VALUES (
            gen_random_uuid(),
            'Starter',
            'Audio only — free for 30 days',
            4.99,
            250,
            2,
            2,
            0.05,
            '{"type": "Audio only", "description": "Audio only", "rooms": 2, "support": "Community", "video": true, "broadcast": true}'::jsonb,
            true,
            NOW()
        )
        ON CONFLICT(name) DO UPDATE SET
            description = 'Audio only — free for 30 days',
            price_monthly = 4.99,
            minutes_included = 250,
            max_rooms = 2,
            max_participants = 2,
            overage_rate_per_min = 0.05,
            features = '{"type": "Audio only", "description": "Audio only", "rooms": 2, "support": "Community", "video": true, "broadcast": true}'::jsonb,
            is_active = true
    """))
    
    # Update or create Pro plan ($9.99, 1000 mins, 10 sessions)
    connection.execute(sa.text("""
        INSERT INTO plans (id, name, description, price_monthly, minutes_included, max_rooms, max_participants, overage_rate_per_min, features, is_active, created_at)
        VALUES (
            gen_random_uuid(),
            'Pro',
            'Video & conversations',
            9.99,
            1000,
            10,
            10,
            0.03,
            '{"type": "Video & conversations", "description": "Video, conversations", "rooms": 10, "support": "Priority Email", "video": true, "broadcast": true}'::jsonb,
            true,
            NOW()
        )
        ON CONFLICT(name) DO UPDATE SET
            description = 'Video & conversations',
            price_monthly = 9.99,
            minutes_included = 1000,
            max_rooms = 10,
            max_participants = 10,
            overage_rate_per_min = 0.03,
            features = '{"type": "Video & conversations", "description": "Video, conversations", "rooms": 10, "support": "Priority Email", "video": true, "broadcast": true}'::jsonb,
            is_active = true
    """))
    
    # Update or create Premium plan ($19.99, 3000 mins, 50 sessions)
    connection.execute(sa.text("""
        INSERT INTO plans (id, name, description, price_monthly, minutes_included, max_rooms, max_participants, overage_rate_per_min, features, is_active, created_at)
        VALUES (
            gen_random_uuid(),
            'Premium',
            'Broadcast & full features',
            19.99,
            3000,
            50,
            50,
            0.02,
            '{"type": "Broadcast & full features", "description": "Broadcast, full features", "rooms": 50, "support": "Priority", "video": true, "broadcast": true}'::jsonb,
            true,
            NOW()
        )
        ON CONFLICT(name) DO UPDATE SET
            description = 'Broadcast & full features',
            price_monthly = 19.99,
            minutes_included = 3000,
            max_rooms = 50,
            max_participants = 50,
            overage_rate_per_min = 0.02,
            features = '{"type": "Broadcast & full features", "description": "Broadcast, full features", "rooms": 50, "support": "Priority", "video": true, "broadcast": true}'::jsonb,
            is_active = true
    """))


def downgrade() -> None:
    # Revert plan changes
    connection = op.get_bind()
    
    # Restore old plans to active
    connection.execute(sa.text("""
        UPDATE plans SET is_active = true 
        WHERE name IN ('Free', 'Enterprise')
    """))
    
    # Deactivate new plans
    connection.execute(sa.text("""
        UPDATE plans SET is_active = false 
        WHERE name IN ('Starter', 'Pro', 'Premium')
    """))
