"""Add visibility and requires_approval to rooms table

Revision ID: 012_add_room_visibility_and_approval
Revises: 011_add_transcript_session_id
Create Date: 2026-03-30 22:15:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '012_room_vis_sync'
down_revision = '011_add_transcript_session_id'
branch_labels = None
depends_on = None

def upgrade():
    # Only add visibility as requires_approval already exists
    op.add_column('rooms', sa.Column('visibility', sa.String(), server_default='private', nullable=False))

def downgrade():
    op.drop_column('rooms', 'visibility')
