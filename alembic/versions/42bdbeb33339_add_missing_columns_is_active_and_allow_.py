"""Add missing columns is_active and allow_recording

Revision ID: 42bdbeb33339
Revises: 004_metered_billing
Create Date: 2026-03-14 02:40:25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '42bdbeb33339'
down_revision: Union[str, Sequence[str], None] = '004_metered_billing'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely create the worker_nodes table
    op.execute('''
    CREATE TABLE IF NOT EXISTS worker_nodes (
        id VARCHAR NOT NULL,
        hostname VARCHAR NOT NULL,
        ip_address VARCHAR,
        status VARCHAR NOT NULL,
        cpu_usage REAL NOT NULL,
        memory_usage REAL NOT NULL,
        latency_ms INTEGER NOT NULL,
        current_room_id UUID,
        last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id)
    )
    ''')

    # Safely add columns to audit_logs
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS org_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_org_id ON audit_logs (org_id)")

    # Safely add columns to invoices
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_created_at ON invoices (created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_org_id ON invoices (org_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_invoices_stripe_invoice_id ON invoices (stripe_invoice_id)")

    # Safely add columns to organizations
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN")

    # Safely add columns to rooms
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS primary_lang VARCHAR DEFAULT 'en'")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS secondary_lang VARCHAR")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS allow_recording BOOLEAN")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS advanced_policy JSONB")

    # Safely add columns to subscriptions
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_active BOOLEAN")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_retry_count INTEGER")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS overage_allowed BOOLEAN")
    
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_grace_period_active ON subscriptions (grace_period_active)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_grace_period_ends_at ON subscriptions (grace_period_ends_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_stripe_customer_id ON subscriptions (stripe_customer_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_stripe_subscription_id ON subscriptions (stripe_subscription_id)")

    # Safely add columns to usage_records
    op.execute("ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS synced_to_stripe BOOLEAN")
    op.execute("ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS stripe_sync_at TIMESTAMP WITH TIME ZONE")
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_records_org_id ON usage_records (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_records_recorded_at ON usage_records (recorded_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_records_synced_to_stripe ON usage_records (synced_to_stripe)")

    # Safely add indexes to users
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_password_reset_token ON users (password_reset_token)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_verification_token ON users (verification_token)")


def downgrade() -> None:
    pass
