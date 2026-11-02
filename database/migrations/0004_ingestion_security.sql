BEGIN;
ALTER TABLE source_registry
 ADD COLUMN IF NOT EXISTS last_etag text,
 ADD COLUMN IF NOT EXISTS last_modified_at text,
 ADD COLUMN IF NOT EXISTS next_poll_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS poll_lease_until timestamptz,
 ADD COLUMN IF NOT EXISTS consecutive_failures smallint NOT NULL DEFAULT 0 CHECK(consecutive_failures BETWEEN 0 AND 12),
 ADD COLUMN IF NOT EXISTS last_error varchar(80);
CREATE INDEX IF NOT EXISTS source_registry_due_idx ON source_registry(next_poll_at,id) WHERE approval_status='approved' AND robots_allowed IS TRUE AND terms_reviewed_at IS NOT NULL;

CREATE TYPE ingestion_item_status AS ENUM ('pending_review','approved','rejected','expired');
CREATE TABLE source_ingestion_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_registry_id uuid NOT NULL REFERENCES source_registry(id) ON DELETE RESTRICT,
 external_id varchar(500) NOT NULL,
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 title varchar(180) NOT NULL CHECK(char_length(title)>=8),
 summary varchar(600) NOT NULL CHECK(char_length(summary)>=20),
 source_published_at timestamptz,
 content_hash char(64) NOT NULL,
 status ingestion_item_status NOT NULL DEFAULT 'pending_review',
 incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 retention_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_registry_id,external_id),
 CHECK((status='pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status<>'pending_review' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX source_ingestion_pending_idx ON source_ingestion_items(created_at ASC,id ASC) WHERE status='pending_review';
CREATE INDEX source_ingestion_retention_idx ON source_ingestion_items(retention_until) WHERE status IN ('approved','rejected','expired');
CREATE TABLE ingestion_moderation_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ingestion_item_id uuid NOT NULL REFERENCES source_ingestion_items(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 action varchar(16) NOT NULL CHECK(action IN ('publish','reject')),
 reason varchar(1000) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingestion_moderation_audit_item_idx ON ingestion_moderation_audit(ingestion_item_id,created_at DESC);

CREATE TABLE web_sessions(
 session_id_hash char(64) PRIMARY KEY CHECK(session_id_hash ~ '^[a-f0-9]{64}$'),
 auth_subject varchar(255) NOT NULL,
 access_token_ciphertext bytea NOT NULL,
 access_token_iv bytea NOT NULL CHECK(octet_length(access_token_iv)=12),
 access_token_tag bytea NOT NULL CHECK(octet_length(access_token_tag)=16),
 csrf_token_hash char(64) NOT NULL CHECK(csrf_token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_sessions_expiry_idx ON web_sessions(expires_at);
CREATE INDEX web_sessions_subject_idx ON web_sessions(auth_subject);

CREATE TYPE live_stream_status AS ENUM ('pending_review','approved','live','ended','rejected');
CREATE TABLE live_stream_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 title varchar(120) NOT NULL CHECK(char_length(title)>=8),
 description varchar(500) NOT NULL CHECK(char_length(description)>=20),
 state varchar(64) NOT NULL CHECK(state IN ('Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','Federal Capital Territory')),
 locality varchar(120),
 channel_name varchar(64) NOT NULL UNIQUE,
 status live_stream_status NOT NULL DEFAULT 'pending_review',
 consent_recorded_at timestamptz NOT NULL,
 approved_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
 approved_at timestamptz,
 started_at timestamptz,
 ended_at timestamptz,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status IN ('approved','live','ended') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status IN ('pending_review','rejected')),
 CHECK(status<>'live' OR started_at IS NOT NULL),
 CHECK(status<>'ended' OR ended_at IS NOT NULL)
);
CREATE INDEX live_stream_public_idx ON live_stream_sessions(started_at DESC) WHERE status='live';
CREATE INDEX live_stream_owner_idx ON live_stream_sessions(owner_id,created_at DESC);
CREATE TABLE live_stream_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 live_stream_id uuid NOT NULL REFERENCES live_stream_sessions(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 action varchar(24) NOT NULL CHECK(action IN ('submit','approve','reject','start','end','token_issued','report')),
 reason varchar(500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_stream_audit_session_idx ON live_stream_audit(live_stream_id,created_at DESC);

CREATE TABLE privacy_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_type varchar(24) NOT NULL CHECK(request_type IN ('access','correction','erasure','restriction','objection')),
 status varchar(24) NOT NULL DEFAULT 'received' CHECK(status IN ('received','in_review','completed','declined')),
 details varchar(2000),
 decision_reason varchar(2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX privacy_requests_user_idx ON privacy_requests(user_id,created_at DESC);

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION reject_audit_mutation() FROM PUBLIC;
CREATE TRIGGER moderation_audit_append_only BEFORE UPDATE OR DELETE ON moderation_audit FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER report_moderation_audit_append_only BEFORE UPDATE OR DELETE ON report_moderation_audit FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER ingestion_moderation_audit_append_only BEFORE UPDATE OR DELETE ON ingestion_moderation_audit FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER live_stream_audit_append_only BEFORE UPDATE OR DELETE ON live_stream_audit FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nsa_app') THEN CREATE ROLE nsa_app NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nsa_worker') THEN CREATE ROLE nsa_worker NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nsa_web') THEN CREATE ROLE nsa_web NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nsa_migrator') THEN CREATE ROLE nsa_migrator NOLOGIN; END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nsa_app,nsa_worker,nsa_web;
GRANT SELECT ON incidents,incident_sources,agency_directory,agency_contacts TO nsa_app;
GRANT SELECT ON source_registry TO nsa_app;
GRANT SELECT,INSERT ON app_users TO nsa_app;
GRANT UPDATE(last_seen_at) ON app_users TO nsa_app;
GRANT SELECT,INSERT,UPDATE ON incident_reports TO nsa_app;
GRANT INSERT,SELECT ON moderation_audit,report_moderation_audit,ingestion_moderation_audit,live_stream_audit TO nsa_app;
GRANT SELECT,INSERT,UPDATE ON source_ingestion_items TO nsa_app;
GRANT INSERT,SELECT ON incidents,incident_sources TO nsa_app;
GRANT SELECT,INSERT,UPDATE ON live_stream_sessions TO nsa_app;
GRANT SELECT,INSERT,UPDATE ON privacy_requests TO nsa_app;
GRANT SELECT ON source_registry TO nsa_worker;
GRANT INSERT,SELECT ON source_ingestion_items TO nsa_worker;
GRANT UPDATE(last_checked_at,last_etag,last_modified_at,next_poll_at,poll_lease_until,consecutive_failures,last_error) ON source_registry TO nsa_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON web_sessions TO nsa_web;
ALTER DEFAULT PRIVILEGES FOR ROLE nsa_migrator IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE nsa_migrator IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
COMMIT;
