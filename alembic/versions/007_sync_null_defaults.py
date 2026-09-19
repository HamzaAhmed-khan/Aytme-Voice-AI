"""Backfill NULL values for legacy columns and add constraints

Revision ID: 007_sync_null_defaults
Revises: 006_finalize_missing_columns
Create Date: 2026-03-17 04:00:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '007_sync_null_defaults'
down_revision = '006_finalize_missing_columns'
branch_labels = None
depends_on = None

def upgrade():
    # 1. Backfill 'subscriptions'
    op.execute("UPDATE subscriptions SET grace_period_active = false WHERE grace_period_active IS NULL")
    op.execute("UPDATE subscriptions SET grace_period_retry_count = 0 WHERE grace_period_retry_count IS NULL")
    op.execute("UPDATE subscriptions SET overage_allowed = true WHERE overage_allowed IS NULL")
    
    # 2. Backfill 'usage_records'
    op.execute("UPDATE usage_records SET synced_to_stripe = false WHERE synced_to_stripe IS NULL")
    op.execute("UPDATE usage_records SET is_overage = false WHERE is_overage IS NULL")
    
    # 3. Backfill 'organizations'
    op.execute("UPDATE organizations SET is_active = true WHERE is_active IS NULL")
    
    # 4. Backfill 'rooms'
    op.execute("UPDATE rooms SET allow_recording = false WHERE allow_recording IS NULL")
    op.execute("UPDATE rooms SET participant_count = 0 WHERE participant_count IS NULL")
    op.execute("UPDATE rooms SET status = 'pending' WHERE status IS NULL")

    # 5. Add NOT NULL constraints where appropriate (Safety)
    # Note: We use raw SQL to avoid issues with complex Alembic type detection on some systems
    op.execute("ALTER TABLE subscriptions ALTER COLUMN grace_period_active SET NOT NULL")
    op.execute("ALTER TABLE subscriptions ALTER COLUMN grace_period_retry_count SET NOT NULL")
    op.execute("ALTER TABLE subscriptions ALTER COLUMN overage_allowed SET NOT NULL")
    
    op.execute("ALTER TABLE usage_records ALTER COLUMN synced_to_stripe SET NOT NULL")
    op.execute("ALTER TABLE usage_records ALTER COLUMN is_overage SET NOT NULL")
    
    op.execute("ALTER TABLE organizations ALTER COLUMN is_active SET NOT NULL")

def downgrade():
    pass
