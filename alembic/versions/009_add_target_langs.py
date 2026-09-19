"""Add target_langs column to rooms table

Revision ID: 009_add_target_langs
Revises: 008_add_system_config
Create Date: 2026-03-26 20:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '009_add_target_langs'
down_revision = '008_add_system_config'
branch_labels = None
depends_on = None

def upgrade():
    # Add target_langs column to rooms table
    # Using JSONB with a default of '[]'
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS target_langs JSONB DEFAULT '[]' NOT NULL")

def downgrade():
    op.execute("ALTER TABLE rooms DROP COLUMN IF EXISTS target_langs")
