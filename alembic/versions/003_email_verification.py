"""Add email verification and password reset token expiry fields idempotently

Revision ID: 003_email_verification
Revises: 002_grace_period
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# Revision identifiers
revision = '003_email_verification'
down_revision = '002_grace_period'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Safely add email verification fields
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP WITH TIME ZONE")
    
    # Safely add password reset fields
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_expires_at TIMESTAMP WITH TIME ZONE")

def downgrade() -> None:
    pass
