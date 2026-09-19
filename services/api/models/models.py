from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from sqlalchemy import (
    Integer, String, Boolean, DateTime, ForeignKey,
    Text, BigInteger, DECIMAL, REAL, JSON, Uuid, LargeBinary
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB, ARRAY

# Portable UUID type: uses native UUID on PostgreSQL, CHAR(36) on SQLite/others
UUIDType = Uuid().with_variant(PG_UUID(as_uuid=True), "postgresql")

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_token: Mapped[Optional[str]] = mapped_column(String, index=True)
    verification_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    password_reset_token: Mapped[Optional[str]] = mapped_column(String, index=True)
    password_reset_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    plan: Mapped[str] = mapped_column(String, default="team")
    owner_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("users.id"))
    settings: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default={})
    max_rooms: Mapped[int] = mapped_column(Integer, default=10)
    max_participants: Mapped[int] = mapped_column(Integer, default=50)
    max_duration_s: Mapped[int] = mapped_column(Integer, default=3600)
    transcript_retention_days: Mapped[int] = mapped_column(Integer, default=30)
    custom_domain: Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class OrgMember(Base):
    __tablename__ = "org_members"

    org_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String, default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    org_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="SET NULL"))
    owner_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("users.id"))
    livekit_room_id: Mapped[Optional[str]] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=True) # Public slug
    mode: Mapped[str] = mapped_column(String, default="conversation") # conversation, talk_together, broadcast
    status: Mapped[str] = mapped_column(String, default="pending")
    source_lang: Mapped[str] = mapped_column(String, default="auto")
    target_langs: Mapped[Optional[List[str]]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=[], nullable=True)
    primary_lang: Mapped[Optional[str]] = mapped_column(String)
    secondary_lang: Mapped[Optional[str]] = mapped_column(String)
    visibility: Mapped[str] = mapped_column(String, default="private")
    allow_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    policy: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default={})
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    worker_id: Mapped[Optional[str]] = mapped_column(String)
    participant_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Platform Mode Extensions
    invite_token: Mapped[Optional[str]] = mapped_column(String, unique=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # Mode 2 — Talk Together Mode Fields (Local session on one device)
    device_session_id: Mapped[Optional[str]] = mapped_column(String)
    mic_a_lang: Mapped[Optional[str]] = mapped_column(String)
    mic_b_lang: Mapped[Optional[str]] = mapped_column(String)

    # Mode 3 — Broadcast Mode Fields (One to many)
    broadcaster_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("users.id"))
    available_langs: Mapped[Optional[List[str]]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=[], nullable=True)
    default_lang: Mapped[Optional[str]] = mapped_column(String) # fallback if listener hasn't picked

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class BillingEvent(Base):
    __tablename__ = "billing_events"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    org_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("organizations.id"))
    user_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("users.id"))
    room_id: Mapped[Optional[UUID]] = mapped_column(UUIDType)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(12, 4), nullable=False)
    unit_price: Mapped[float] = mapped_column(DECIMAL(10, 6), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    billed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String, unique=True)

class Quota(Base):
    __tablename__ = "quotas"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    org_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("organizations.id"), unique=True)
    rooms_month: Mapped[int] = mapped_column(Integer, default=10)
    minutes_month: Mapped[int] = mapped_column(Integer, default=1000)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    org_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, index=True)
    actor_id: Mapped[UUID] = mapped_column(UUIDType)
    actor_type: Mapped[str] = mapped_column(String)  # user, system, worker
    action: Mapped[str] = mapped_column(String)     # room_create, user_login, etc.
    resource_type: Mapped[str] = mapped_column(String)
    resource_id: Mapped[str] = mapped_column(String)
    outcome: Mapped[str] = mapped_column(String)     # success, failure
    payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    room_id: Mapped[UUID] = mapped_column(UUIDType, nullable=False)
    room_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="SET NULL"))
    identity: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default="participant")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    audio_bytes: Mapped[int] = mapped_column(BigInteger, default=0)

class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    room_id: Mapped[UUID] = mapped_column(UUIDType, nullable=False)
    org_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="SET NULL"))
    participant_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("participants.id", ondelete="SET NULL"))
    speaker_identity: Mapped[Optional[str]] = mapped_column(String)
    is_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    source_lang: Mapped[str] = mapped_column(String, nullable=False)
    target_lang: Mapped[str] = mapped_column(String, nullable=False)
    text_raw: Mapped[str] = mapped_column(Text, nullable=False)
    text_translated: Mapped[Optional[str]] = mapped_column(Text)
    confidence: Mapped[Optional[float]] = mapped_column(REAL)
    start_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    end_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_final: Mapped[bool] = mapped_column(Boolean, default=True)
    session_id: Mapped[Optional[UUID]] = mapped_column(UUIDType)
    artifact_key: Mapped[Optional[str]] = mapped_column(String)
    tts_key: Mapped[Optional[str]] = mapped_column(String)
    tts_duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    sample_rate: Mapped[int] = mapped_column(Integer, default=48000)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class TTSArtifact(Base):
    __tablename__ = "tts_artifacts"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    fingerprint: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    transcript_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("transcripts.id", ondelete="SET NULL"))
    room_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, nullable=True, index=True)
    s3_key: Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True)
    cdn_url: Mapped[Optional[str]] = mapped_column(String)
    voice_id: Mapped[str] = mapped_column(String, nullable=False)
    language: Mapped[str] = mapped_column(String, nullable=False)
    audio_format: Mapped[str] = mapped_column(String, default="mp3")
    audio_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    sample_rate: Mapped[int] = mapped_column(Integer, default=48000)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class WorkerAssignment(Base):
    __tablename__ = "worker_assignments"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    room_id: Mapped[UUID] = mapped_column(UUIDType, nullable=False)
    worker_id: Mapped[str] = mapped_column(String, nullable=False)
    worker_host: Mapped[str] = mapped_column(String, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    last_heartbeat: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class WorkerNode(Base):
    __tablename__ = "worker_nodes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    hostname: Mapped[str] = mapped_column(String)
    ip_address: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="idle")  # idle, busy, offline, error
    cpu_usage: Mapped[float] = mapped_column(REAL, default=0)
    memory_usage: Mapped[float] = mapped_column(REAL, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    current_room_id: Mapped[Optional[UUID]] = mapped_column(UUIDType)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    scopes: Mapped[List[str]] = mapped_column(JSON().with_variant(ARRAY(String), "postgresql"), default=[])
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    price_monthly: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    minutes_included: Mapped[int] = mapped_column(Integer, default=1000)
    overage_rate_per_min: Mapped[float] = mapped_column(DECIMAL(10, 4), default=0.05)
    max_rooms: Mapped[int] = mapped_column(Integer, default=10)
    max_participants: Mapped[int] = mapped_column(Integer, default=50)
    paypal_plan_id: Mapped[Optional[str]] = mapped_column(String, index=True)
    features: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default={})
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    org_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True)
    plan_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("plans.id"))
    status: Mapped[str] = mapped_column(String, default="active")
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    paypal_subscription_id: Mapped[Optional[str]] = mapped_column(String, index=True)
    billing_provider: Mapped[str] = mapped_column(String, default="paypal", index=True)
    grace_period_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    grace_period_active: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, index=True)
    grace_period_retry_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    overage_allowed: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class UsageRecord(Base):
    __tablename__ = "usage_records"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    org_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[Optional[UUID]] = mapped_column(UUIDType)
    minutes_used: Mapped[float] = mapped_column(DECIMAL(12, 4), default=0)
    is_overage: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

class PayPalWebhookEvent(Base):
    __tablename__ = "paypal_webhook_events"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    paypal_event_id: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    org_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="SET NULL"))
    payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default={})
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    org_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    subscription_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("subscriptions.id"))
    paypal_invoice_id: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    status: Mapped[str] = mapped_column(String, default="pending")
    pdf_url: Mapped[Optional[str]] = mapped_column(String)
    billing_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    billing_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    room_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("rooms.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String, default="listener")
    max_uses: Mapped[int] = mapped_column(Integer, default=1)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class GracePeriod(Base):
    __tablename__ = "grace_periods"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    subscription_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("subscriptions.id", ondelete="CASCADE"), unique=True, index=True)
    org_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    initiated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    last_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    failed_payment_event_id: Mapped[Optional[str]] = mapped_column(String)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolution_reason: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class SystemConfig(Base):
    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String, default="general")
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class JoinRequest(Base):
    __tablename__ = "join_requests"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    room_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    identity: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


# ─── NEW PHASE II MODELS ────────────────────────────────────────

class DiscountCode(Base):
    __tablename__ = "discount_codes"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    percent_off: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-100
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    used_by_user_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("users.id"), nullable=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("users.id"), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[str] = mapped_column(String(64), default="general")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class UserVoicePreference(Base):
    __tablename__ = "user_voice_preferences"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUIDType, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    preferred_locale: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    preferred_voice_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    playback_speed: Mapped[float] = mapped_column(REAL, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class TranslationMetric(Base):
    __tablename__ = "translation_metrics"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    user_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, ForeignKey("users.id"), nullable=True, index=True)
    room_id: Mapped[Optional[UUID]] = mapped_column(UUIDType, nullable=True, index=True)
    source_lang: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    target_lang: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    stt_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    translation_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tts_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tts_quality_score: Mapped[Optional[float]] = mapped_column(REAL, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

