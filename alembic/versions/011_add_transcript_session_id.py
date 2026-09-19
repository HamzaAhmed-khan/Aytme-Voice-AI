"""add transcript session_id and is_final

Revision ID: 011_add_transcript_session_id
Revises: 95a200a9254f
Create Date: 2026-03-30 14:40:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '011_add_transcript_session_id'
down_revision = '010_add_plan_stripe_price_id'
branch_labels = None
depends_on = None

def upgrade():
    # Add session_id column (UUID)
    op.add_column('transcripts', sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=True))
    # Add is_final column (Boolean)
    op.add_column('transcripts', sa.Column('is_final', sa.Boolean(), server_default='true', nullable=False))
    
    # Create index for session_id
    op.create_index(op.f('ix_transcripts_session_id'), 'transcripts', ['session_id'], unique=False)

def downgrade():
    op.drop_index(op.f('ix_transcripts_session_id'), table_name='transcripts')
    op.drop_column('transcripts', 'is_final')
    op.drop_column('transcripts', 'session_id')
