"""Add TTS audio storage columns to tts_artifacts table

Revision ID: 013_add_tts_audio_storage
Revises: 95a200a9254f
Create Date: 2026-04-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '013_add_tts_audio_storage'
down_revision: Union[str, Sequence[str], None] = '010a04de9981'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to tts_artifacts for direct DB audio storage
    op.add_column('tts_artifacts', sa.Column('room_id', sa.Uuid(), nullable=True))
    op.add_column('tts_artifacts', sa.Column('audio_format', sa.String(), server_default='mp3', nullable=True))
    op.add_column('tts_artifacts', sa.Column('audio_data', sa.LargeBinary(), nullable=True))
    
    # Make s3_key nullable (was NOT NULL before — we don't always use S3)
    op.alter_column('tts_artifacts', 's3_key', existing_type=sa.String(), nullable=True)
    
    # Add index on room_id for fast per-room audio retrieval
    op.create_index('ix_tts_artifacts_room_id', 'tts_artifacts', ['room_id'])


def downgrade() -> None:
    op.drop_index('ix_tts_artifacts_room_id', table_name='tts_artifacts')
    op.drop_column('tts_artifacts', 'audio_data')
    op.drop_column('tts_artifacts', 'audio_format')
    op.drop_column('tts_artifacts', 'room_id')
    op.alter_column('tts_artifacts', 's3_key', existing_type=sa.String(), nullable=False)
