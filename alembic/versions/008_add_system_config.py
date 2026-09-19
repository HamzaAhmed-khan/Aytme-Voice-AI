"""Add system_config table

Revision ID: 008_add_system_config
Revises: 007_sync_null_defaults
Create Date: 2026-03-24 10:00:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '008_add_system_config'
down_revision = '007_sync_null_defaults'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'system_config',
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(), server_default='general', nullable=False),
        sa.Column('is_secret', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('key')
    )

def downgrade():
    op.drop_table('system_config')
