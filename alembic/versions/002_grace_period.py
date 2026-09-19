"""Add GracePeriod table and grace period fields idempotently

Revision ID: 002_grace_period
Revises: 001_stripe_integration
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# Revision identifiers
revision = '002_grace_period'
down_revision = '001_stripe_integration'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Safely add fields to subscriptions
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_active BOOLEAN NOT NULL DEFAULT false")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_grace_period_active ON subscriptions (grace_period_active)")
            
    # Actually add the missing column before attempting to index it
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP WITH TIME ZONE")
    # Ensure index on grace_period_ends_at
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_grace_period_ends_at ON subscriptions (grace_period_ends_at)")

    # 2. Prevent "relation already exists" for grace_periods by using IF NOT EXISTS
    op.execute("""
    CREATE TABLE IF NOT EXISTS grace_periods (
        id UUID NOT NULL,
        subscription_id UUID NOT NULL,
        org_id UUID NOT NULL,
        initiated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        retry_count INTEGER DEFAULT 0 NOT NULL,
        last_retry_at TIMESTAMP WITH TIME ZONE,
        failed_payment_event_id VARCHAR,
        resolved_at TIMESTAMP WITH TIME ZONE,
        resolution_reason VARCHAR,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_grace_periods_subscription_id_subscriptions FOREIGN KEY(subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE,
        CONSTRAINT fk_grace_periods_org_id_organizations FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT uq_grace_period_subscription_id UNIQUE (subscription_id)
    )
    """)
    
    op.execute("CREATE INDEX IF NOT EXISTS ix_grace_periods_subscription_id ON grace_periods (subscription_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_grace_periods_org_id ON grace_periods (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_grace_periods_expires_at ON grace_periods (expires_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_grace_periods_is_active ON grace_periods (is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_grace_periods_created_at ON grace_periods (created_at)")

def downgrade() -> None:
    pass
