"""Finalize missing columns in rooms and usage_records

Revision ID: 006_finalize_missing_columns
Revises: 005_recalibrate_plan_ids
Create Date: 2026-03-17 03:50:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '006_finalize_missing_columns'
down_revision = '005_recalibrate_plan_ids'
branch_labels = None
depends_on = None

def upgrade():
    # 1. Add missing columns to 'rooms' table
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS policy JSONB DEFAULT '{}'")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS worker_id VARCHAR")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS participant_count INTEGER DEFAULT 0")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE")

    # 2. Add missing columns to 'usage_records' table
    op.execute("ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS room_id UUID")
    op.execute("ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS is_overage BOOLEAN DEFAULT FALSE")
    
    # 3. Add indexes for performance
    op.execute("CREATE INDEX IF NOT EXISTS ix_rooms_status ON rooms (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_records_is_overage ON usage_records (is_overage)")

def downgrade():
    pass
