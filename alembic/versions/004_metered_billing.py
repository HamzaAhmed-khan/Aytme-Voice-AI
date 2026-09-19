"""Add metered billing sync fields to usage_records idempotently

Revision ID: 004_metered_billing
Revises: 003_email_verification
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '004_metered_billing'
down_revision = '003_email_verification'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Safely add is_overage
    op.execute("ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS is_overage BOOLEAN DEFAULT false")
    
    # Safely add synced_to_stripe
    op.execute("ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS synced_to_stripe BOOLEAN DEFAULT false")
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_records_synced_to_stripe ON usage_records (synced_to_stripe)")
    
    # Safely add stripe_sync_at
    op.execute("ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS stripe_sync_at TIMESTAMP WITH TIME ZONE")
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_records_stripe_sync_at ON usage_records (stripe_sync_at)")

    # Safely create composite index
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_records_is_overage_synced ON usage_records (is_overage, synced_to_stripe)")

def downgrade() -> None:
    pass

