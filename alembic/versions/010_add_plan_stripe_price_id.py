"""Add stripe_price_id to plans table

Revision ID: 010_add_plan_stripe_price_id
Revises: 009_add_target_langs
Create Date: 2026-03-27 00:40:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '010_add_plan_stripe_price_id'
down_revision = '95a200a9254f'
branch_labels = None
depends_on = None

def upgrade():
    # Add stripe_price_id column to plans table
    op.add_column('plans', sa.Column('stripe_price_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_plans_stripe_price_id'), 'plans', ['stripe_price_id'], unique=False)

def downgrade():
    op.drop_index(op.f('ix_plans_stripe_price_id'), table_name='plans')
    op.drop_column('plans', 'stripe_price_id')
