"""Alembic migration: Unified initial schema and Stripe integration

Revision ID: 001_stripe_integration
Revises: None
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# Revision identifiers
revision = '001_stripe_integration'
down_revision = None  # ROOT OF THE CHAIN
branch_labels = None
depends_on = None

def table_exists(table_name):
    conn = op.get_bind()
    insp = inspect(conn)
    return table_name in insp.get_table_names()

def column_exists(table_name, column_name):
    conn = op.get_bind()
    insp = inspect(conn)
    columns = [c['name'] for c in insp.get_columns(table_name)]
    return column_name in columns

def upgrade():
    # 0. Ensure extensions exist
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # 1. CORE TABLES (Baseline)
    if not table_exists('users'):
        op.create_table(
            'users',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('email', sa.String(), nullable=False),
            sa.Column('hashed_password', sa.String(), nullable=False),
            sa.Column('full_name', sa.String(), nullable=True),
            sa.Column('role', sa.String(), server_default='member', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('is_verified', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('verification_token', sa.String(), nullable=True),
            sa.Column('verification_token_expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('password_reset_token', sa.String(), nullable=True),
            sa.Column('password_reset_token_expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('email')
        )
        op.create_index('ix_users_email', 'users', ['email'])

    if not table_exists('organizations'):
        op.create_table(
            'organizations',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('slug', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('plan', sa.String(), server_default='team', nullable=False),
            sa.Column('owner_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
            sa.Column('max_rooms', sa.Integer(), server_default='10', nullable=False),
            sa.Column('max_participants', sa.Integer(), server_default='50', nullable=False),
            sa.Column('max_duration_s', sa.Integer(), server_default='3600', nullable=False),
            sa.Column('transcript_retention_days', sa.Integer(), server_default='30', nullable=False),
            sa.Column('custom_domain', sa.String(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug'),
            sa.UniqueConstraint('custom_domain')
        )

    if not table_exists('plans'):
        op.create_table(
            'plans',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('price_monthly', sa.DECIMAL(precision=10, scale=2), server_default='0', nullable=False),
            sa.Column('minutes_included', sa.Integer(), server_default='1000', nullable=False),
            sa.Column('overage_rate_per_min', sa.DECIMAL(precision=10, scale=4), server_default='0.05', nullable=False),
            sa.Column('max_rooms', sa.Integer(), server_default='10', nullable=False),
            sa.Column('max_participants', sa.Integer(), server_default='50', nullable=False),
            sa.Column('features', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('name')
        )

    if not table_exists('subscriptions'):
        op.create_table(
            'subscriptions',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('plan_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('status', sa.String(), server_default='active', nullable=False),
            sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=True),
            sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
            sa.Column('cancel_at_period_end', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('org_id')
        )

    # 2. STRIPE TABLES
    if not table_exists('stripe_customers'):
        op.create_table(
            'stripe_customers',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('stripe_customer_id', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('org_id'),
            sa.UniqueConstraint('stripe_customer_id')
        )
        op.create_index('ix_stripe_customers_stripe_customer_id', 'stripe_customers', ['stripe_customer_id'])

    if not table_exists('stripe_webhook_events'):
        op.create_table(
            'stripe_webhook_events',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('stripe_event_id', sa.String(), nullable=False),
            sa.Column('event_type', sa.String(), nullable=False),
            sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('payload', postgresql.JSONB(), nullable=True),
            sa.Column('processed', sa.Boolean(), nullable=False, server_default=sa.literal(False)),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('stripe_event_id')
        )
        op.create_index('ix_stripe_webhook_events_stripe_event_id', 'stripe_webhook_events', ['stripe_event_id'])

    # 3. LEGACY TABLES (Rooms, Usage, etc.)
    if not table_exists('rooms'):
        op.create_table(
            'rooms',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('owner_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('livekit_room_id', sa.String(), nullable=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('status', sa.String(), server_default='pending', nullable=False),
            sa.Column('source_lang', sa.String(), server_default='auto', nullable=False),
            sa.Column('target_langs', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )

    if not table_exists('usage_records'):
        op.create_table(
            'usage_records',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('minutes_used', sa.DECIMAL(precision=12, scale=4), server_default='0', nullable=False),
            sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_usage_records_org_id', 'usage_records', ['org_id'])

    # 3.5 SAFE-GUARD MISSING TABLES (Guarantees ALL models exist before downstream patches)
    op.execute('''
        CREATE TABLE IF NOT EXISTS org_members (
            org_id UUID NOT NULL, 
            user_id UUID NOT NULL, 
            role VARCHAR NOT NULL, 
            joined_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (org_id, user_id), 
            FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE, 
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS billing_events (
            id UUID NOT NULL, 
            org_id UUID, 
            user_id UUID, 
            room_id UUID, 
            event_type VARCHAR NOT NULL, 
            quantity DECIMAL(12, 4) NOT NULL, 
            unit_price DECIMAL(10, 6) NOT NULL, 
            currency VARCHAR(3) NOT NULL, 
            billed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            period_start TIMESTAMP WITH TIME ZONE NOT NULL, 
            period_end TIMESTAMP WITH TIME ZONE NOT NULL, 
            idempotency_key VARCHAR, 
            PRIMARY KEY (id), 
            FOREIGN KEY(org_id) REFERENCES organizations (id), 
            FOREIGN KEY(user_id) REFERENCES users (id), 
            UNIQUE (idempotency_key)
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS quotas (
            id UUID NOT NULL, 
            org_id UUID NOT NULL, 
            rooms_month INTEGER NOT NULL, 
            minutes_month INTEGER NOT NULL, 
            created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id), 
            UNIQUE (org_id), 
            FOREIGN KEY(org_id) REFERENCES organizations (id)
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID NOT NULL, 
            org_id UUID, 
            actor_id UUID NOT NULL, 
            actor_type VARCHAR NOT NULL, 
            action VARCHAR NOT NULL, 
            resource_type VARCHAR NOT NULL, 
            resource_id VARCHAR NOT NULL, 
            outcome VARCHAR NOT NULL, 
            payload JSONB NOT NULL, 
            created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id)
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS participants (
            id UUID NOT NULL, 
            room_id UUID NOT NULL, 
            room_date TIMESTAMP WITH TIME ZONE NOT NULL, 
            user_id UUID, 
            identity VARCHAR NOT NULL, 
            display_name VARCHAR NOT NULL, 
            role VARCHAR NOT NULL, 
            joined_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            left_at TIMESTAMP WITH TIME ZONE, 
            audio_bytes BIGINT NOT NULL, 
            PRIMARY KEY (id), 
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS transcripts (
            id UUID NOT NULL, 
            room_id UUID NOT NULL, 
            participant_id UUID, 
            source_lang VARCHAR NOT NULL, 
            target_lang VARCHAR NOT NULL, 
            text_raw TEXT NOT NULL, 
            text_translated TEXT, 
            confidence REAL, 
            start_ms BIGINT NOT NULL, 
            end_ms BIGINT NOT NULL, 
            artifact_key VARCHAR, 
            tts_key VARCHAR, 
            tts_duration_ms INTEGER, 
            sample_rate INTEGER NOT NULL, 
            created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id), 
            FOREIGN KEY(participant_id) REFERENCES participants (id) ON DELETE SET NULL
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS tts_artifacts (
            id UUID NOT NULL, 
            fingerprint VARCHAR NOT NULL, 
            transcript_id UUID, 
            s3_key VARCHAR NOT NULL, 
            cdn_url VARCHAR, 
            voice_id VARCHAR NOT NULL, 
            language VARCHAR NOT NULL, 
            sample_rate INTEGER NOT NULL, 
            duration_ms INTEGER NOT NULL, 
            size_bytes BIGINT NOT NULL, 
            hit_count INTEGER NOT NULL, 
            expires_at TIMESTAMP WITH TIME ZONE, 
            created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id), 
            UNIQUE (fingerprint), 
            FOREIGN KEY(transcript_id) REFERENCES transcripts (id) ON DELETE SET NULL, 
            UNIQUE (s3_key)
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS worker_assignments (
            id UUID NOT NULL, 
            room_id UUID NOT NULL, 
            worker_id VARCHAR NOT NULL, 
            worker_host VARCHAR NOT NULL, 
            assigned_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            released_at TIMESTAMP WITH TIME ZONE, 
            failure_count INTEGER NOT NULL, 
            last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id)
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS api_tokens (
            id UUID NOT NULL, 
            user_id UUID NOT NULL, 
            org_id UUID, 
            name VARCHAR NOT NULL, 
            token_hash VARCHAR NOT NULL, 
            scopes VARCHAR[] NOT NULL, 
            last_used_at TIMESTAMP WITH TIME ZONE, 
            expires_at TIMESTAMP WITH TIME ZONE, 
            revoked_at TIMESTAMP WITH TIME ZONE, 
            created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id), 
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
            FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE, 
            UNIQUE (token_hash)
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS invoices (
            id UUID NOT NULL, 
            org_id UUID NOT NULL, 
            subscription_id UUID NOT NULL, 
            stripe_invoice_id VARCHAR, 
            amount DECIMAL(10, 2) NOT NULL, 
            currency VARCHAR(3) NOT NULL, 
            status VARCHAR NOT NULL, 
            pdf_url VARCHAR, 
            billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL, 
            billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL, 
            paid_at TIMESTAMP WITH TIME ZONE, 
            created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id), 
            FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE, 
            FOREIGN KEY(subscription_id) REFERENCES subscriptions (id)
        )
    ''')

    op.execute('''
        CREATE TABLE IF NOT EXISTS invite_tokens (
            id UUID NOT NULL, 
            room_id UUID NOT NULL, 
            token VARCHAR NOT NULL, 
            role VARCHAR NOT NULL, 
            max_uses INTEGER NOT NULL, 
            use_count INTEGER NOT NULL, 
            expires_at TIMESTAMP WITH TIME ZONE, 
            created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
            PRIMARY KEY (id), 
            FOREIGN KEY(room_id) REFERENCES rooms (id) ON DELETE CASCADE, 
            UNIQUE (token)
        )
    ''')

    # 4. DATA SEEDING
    op.execute(
        '''
        INSERT INTO plans (id, name, description, price_monthly, minutes_included, overage_rate_per_min, max_rooms, max_participants, features, is_active, created_at)
        VALUES
            ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Free', 'Free tier for testing', 0.00, 60, 0.10, 2, 5, '{"overage_allowed": false, "retention": "24h", "support": "Community"}'::jsonb, true, now()),
            ('f47ac10b-58cc-4372-a567-0e02b2c3d480', 'Pro', 'Professional plan', 29.00, 1000, 0.05, 50, 25, '{"overage_allowed": true, "retention": "30 days", "support": "Priority Email"}'::jsonb, true, now()),
            ('f47ac10b-58cc-4372-a567-0e02b2c3d481', 'Enterprise', 'Enterprise plan with unlimited usage', 199.00, 10000, 0.03, 999, 999, '{"overage_allowed": true, "retention": "1 year", "support": "Dedicated SLA"}'::jsonb, true, now())
        ON CONFLICT (name) DO NOTHING
        '''
    )

def downgrade():
    pass
