"""Add discount codes and feature flags tables

Revision ID: 014_add_discount_codes_and_feature_flags
Revises: 013_add_tts_audio_storage
Create Date: 2026-04-05 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '014_add_discount_codes_and_feature_flags'
down_revision: Union[str, Sequence[str], None] = '013_add_tts_audio_storage'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name):
    """Check if a table already exists in the database."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": table_name})
    return result.scalar()


def _index_exists(index_name):
    """Check if an index already exists in the database."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :i)"
    ), {"i": index_name})
    return result.scalar()


def upgrade() -> None:
    # 1. Create discount_codes table (if not already present from prior run)
    if not _table_exists('discount_codes'):
        op.create_table('discount_codes',
            sa.Column('id', sa.Uuid().with_variant(postgresql.UUID(as_uuid=True), 'postgresql'), nullable=False),
            sa.Column('code', sa.String(50), nullable=False),
            sa.Column('percent_off', sa.Integer(), nullable=False),
            sa.Column('is_used', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('used_by_user_id', sa.Uuid().with_variant(postgresql.UUID(as_uuid=True), 'postgresql'), nullable=True),
            sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_by_user_id', sa.Uuid().with_variant(postgresql.UUID(as_uuid=True), 'postgresql'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['used_by_user_id'], ['users.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code')
        )
    if not _index_exists('ix_discount_codes_code'):
        op.create_index(op.f('ix_discount_codes_code'), 'discount_codes', ['code'], unique=True)
    if not _index_exists('ix_discount_codes_used_by_user_id'):
        op.create_index(op.f('ix_discount_codes_used_by_user_id'), 'discount_codes', ['used_by_user_id'], unique=False)
    if not _index_exists('ix_discount_codes_expires_at'):
        op.create_index(op.f('ix_discount_codes_expires_at'), 'discount_codes', ['expires_at'], unique=False)

    # 2. Create feature_flags table (if not already present from prior run)
    if not _table_exists('feature_flags'):
        op.create_table('feature_flags',
            sa.Column('id', sa.Uuid().with_variant(postgresql.UUID(as_uuid=True), 'postgresql'), nullable=False),
            sa.Column('key', sa.String(100), nullable=False),
            sa.Column('name', sa.String(200), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('category', sa.String(50), nullable=False, server_default='general'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('key')
        )
    if not _index_exists('ix_feature_flags_key'):
        op.create_index(op.f('ix_feature_flags_key'), 'feature_flags', ['key'], unique=True)
    if not _index_exists('ix_feature_flags_category'):
        op.create_index(op.f('ix_feature_flags_category'), 'feature_flags', ['category'], unique=False)


def downgrade() -> None:
    # 1. Drop feature_flags table
    op.drop_index(op.f('ix_feature_flags_category'), table_name='feature_flags')
    op.drop_index(op.f('ix_feature_flags_key'), table_name='feature_flags')
    op.drop_table('feature_flags')

    # 2. Drop discount_codes table
    op.drop_index(op.f('ix_discount_codes_expires_at'), table_name='discount_codes')
    op.drop_index(op.f('ix_discount_codes_used_by_user_id'), table_name='discount_codes')
    op.drop_index(op.f('ix_discount_codes_code'), table_name='discount_codes')
    op.drop_table('discount_codes')
