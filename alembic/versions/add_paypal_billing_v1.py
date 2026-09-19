"""Add PayPal billing fields and webhook events table

Revision ID: add_paypal_billing_v1
Revises: 89bde9cf1304
Create Date: 2026-04-04 07:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'add_paypal_billing_v1'
down_revision: Union[str, Sequence[str], None] = '89bde9cf1304'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns to plans
    op.add_column('plans', sa.Column('paypal_plan_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_plans_paypal_plan_id'), 'plans', ['paypal_plan_id'], unique=False)

    # 2. Add columns to subscriptions
    op.add_column('subscriptions', sa.Column('paypal_subscription_id', sa.String(), nullable=True))
    op.add_column('subscriptions', sa.Column('billing_provider', sa.String(), server_default='stripe', nullable=False))
    op.create_index(op.f('ix_subscriptions_paypal_subscription_id'), 'subscriptions', ['paypal_subscription_id'], unique=False)
    op.create_index(op.f('ix_subscriptions_billing_provider'), 'subscriptions', ['billing_provider'], unique=False)

    # 3. Add columns to invoices
    op.add_column('invoices', sa.Column('paypal_invoice_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_invoices_paypal_invoice_id'), 'invoices', ['paypal_invoice_id'], unique=True)

    # 4. Create paypal_webhook_events table
    op.create_table('paypal_webhook_events',
        sa.Column('id', sa.Uuid().with_variant(postgresql.UUID(as_uuid=True), 'postgresql'), nullable=False),
        sa.Column('paypal_event_id', sa.String(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('org_id', sa.Uuid().with_variant(postgresql.UUID(as_uuid=True), 'postgresql'), nullable=True),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('processed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('paypal_event_id')
    )
    op.create_index(op.f('ix_paypal_webhook_events_paypal_event_id'), 'paypal_webhook_events', ['paypal_event_id'], unique=True)
    op.create_index(op.f('ix_paypal_webhook_events_created_at'), 'paypal_webhook_events', ['created_at'], unique=False)


def downgrade() -> None:
    # 1. Drop paypal_webhook_events table
    op.drop_table('paypal_webhook_events')

    # 2. Add columns to invoices
    op.drop_index(op.f('ix_invoices_paypal_invoice_id'), table_name='invoices')
    op.drop_column('invoices', 'paypal_invoice_id')

    # 3. Add columns to subscriptions
    op.drop_index(op.f('ix_subscriptions_billing_provider'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_paypal_subscription_id'), table_name='subscriptions')
    op.drop_column('subscriptions', 'billing_provider')
    op.drop_column('subscriptions', 'paypal_subscription_id')

    # 4. Add columns to plans
    op.drop_index(op.f('ix_plans_paypal_plan_id'), table_name='plans')
    op.drop_column('plans', 'paypal_plan_id')
