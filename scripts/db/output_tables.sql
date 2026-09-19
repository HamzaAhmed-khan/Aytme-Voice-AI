CREATE TABLE IF NOT EXISTS users (
	id UUID NOT NULL, 
	email VARCHAR NOT NULL, 
	hashed_password VARCHAR NOT NULL, 
	full_name VARCHAR, 
	role VARCHAR NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	is_verified BOOLEAN NOT NULL, 
	verification_token VARCHAR, 
	verification_token_expires_at TIMESTAMP WITH TIME ZONE, 
	password_reset_token VARCHAR, 
	password_reset_token_expires_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS organizations (
	id UUID NOT NULL, 
	slug VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	plan VARCHAR NOT NULL, 
	owner_id UUID NOT NULL, 
	settings JSONB NOT NULL, 
	max_rooms INTEGER NOT NULL, 
	max_participants INTEGER NOT NULL, 
	max_duration_s INTEGER NOT NULL, 
	transcript_retention_days INTEGER NOT NULL, 
	custom_domain VARCHAR, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (slug), 
	FOREIGN KEY(owner_id) REFERENCES users (id), 
	UNIQUE (custom_domain)
);

CREATE TABLE IF NOT EXISTS org_members (
	org_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	role VARCHAR NOT NULL, 
	joined_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (org_id, user_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rooms (
	id UUID NOT NULL, 
	org_id UUID, 
	owner_id UUID, 
	livekit_room_id VARCHAR, 
	name VARCHAR NOT NULL, 
	status VARCHAR NOT NULL, 
	source_lang VARCHAR NOT NULL, 
	target_langs VARCHAR[] NOT NULL, 
	primary_lang VARCHAR NOT NULL, 
	secondary_lang VARCHAR, 
	allow_recording BOOLEAN NOT NULL, 
	advanced_policy JSONB NOT NULL, 
	policy JSONB NOT NULL, 
	worker_id VARCHAR, 
	participant_count INTEGER NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE, 
	ended_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE SET NULL, 
	FOREIGN KEY(owner_id) REFERENCES users (id), 
	UNIQUE (livekit_room_id)
);

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
);

CREATE TABLE IF NOT EXISTS quotas (
	id UUID NOT NULL, 
	org_id UUID NOT NULL, 
	rooms_month INTEGER NOT NULL, 
	minutes_month INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (org_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);

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
);

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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS worker_nodes (
	id VARCHAR NOT NULL, 
	hostname VARCHAR NOT NULL, 
	ip_address VARCHAR, 
	status VARCHAR NOT NULL, 
	cpu_usage REAL NOT NULL, 
	memory_usage REAL NOT NULL, 
	latency_ms INTEGER NOT NULL, 
	current_room_id UUID, 
	last_seen TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

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
);

CREATE TABLE IF NOT EXISTS plans (
	id UUID NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	price_monthly DECIMAL(10, 2) NOT NULL, 
	minutes_included INTEGER NOT NULL, 
	overage_rate_per_min DECIMAL(10, 4) NOT NULL, 
	max_rooms INTEGER NOT NULL, 
	max_participants INTEGER NOT NULL, 
	features JSONB NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS stripe_customers (
	id UUID NOT NULL, 
	org_id UUID NOT NULL, 
	stripe_customer_id VARCHAR NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (org_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
	id UUID NOT NULL, 
	org_id UUID NOT NULL, 
	plan_id UUID NOT NULL, 
	status VARCHAR NOT NULL, 
	current_period_start TIMESTAMP WITH TIME ZONE NOT NULL, 
	current_period_end TIMESTAMP WITH TIME ZONE NOT NULL, 
	cancel_at_period_end BOOLEAN NOT NULL, 
	stripe_customer_id VARCHAR, 
	stripe_subscription_id VARCHAR, 
	grace_period_ends_at TIMESTAMP WITH TIME ZONE, 
	grace_period_active BOOLEAN NOT NULL, 
	grace_period_retry_count INTEGER NOT NULL, 
	overage_allowed BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (org_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(plan_id) REFERENCES plans (id)
);

CREATE TABLE IF NOT EXISTS usage_records (
	id UUID NOT NULL, 
	org_id UUID NOT NULL, 
	room_id UUID, 
	minutes_used DECIMAL(12, 4) NOT NULL, 
	is_overage BOOLEAN NOT NULL, 
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	synced_to_stripe BOOLEAN NOT NULL, 
	stripe_sync_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
	id UUID NOT NULL, 
	stripe_event_id VARCHAR NOT NULL, 
	event_type VARCHAR NOT NULL, 
	org_id UUID, 
	payload JSONB NOT NULL, 
	processed BOOLEAN NOT NULL, 
	error_message TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	processed_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE SET NULL
);

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
);

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
);

CREATE TABLE IF NOT EXISTS grace_periods (
	id UUID NOT NULL, 
	subscription_id UUID NOT NULL, 
	org_id UUID NOT NULL, 
	initiated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	retry_count INTEGER NOT NULL, 
	last_retry_at TIMESTAMP WITH TIME ZONE, 
	failed_payment_event_id VARCHAR, 
	resolved_at TIMESTAMP WITH TIME ZONE, 
	resolution_reason VARCHAR, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE, 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);

