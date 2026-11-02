BEGIN;
GRANT ALL ON ALL TABLES IN SCHEMA public TO nsa_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO nsa_migrator;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO nsa_migrator;
ALTER TABLE live_stream_sessions ADD COLUMN IF NOT EXISTS consent_version varchar(32) NOT NULL DEFAULT '2026-11-02-v1';
DROP INDEX IF EXISTS source_registry_due_idx;
CREATE INDEX source_registry_due_review_idx ON source_registry(next_poll_at,id) WHERE approval_status='approved' AND robots_allowed IS TRUE AND robots_checked_at IS NOT NULL AND terms_reviewed_at IS NOT NULL;
SET LOCAL ROLE nsa_migrator;
CREATE TYPE live_stream_report_status AS ENUM ('pending_review','resolved','dismissed');
CREATE TABLE live_stream_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 live_stream_id uuid NOT NULL REFERENCES live_stream_sessions(id) ON DELETE RESTRICT,
 reporter_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 reason varchar(1000) NOT NULL CHECK(char_length(reason)>=20),
 status live_stream_report_status NOT NULL DEFAULT 'pending_review',
 reviewed_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
 review_note varchar(1000),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(live_stream_id,reporter_id),
 CHECK((status='pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status<>'pending_review' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX live_stream_reports_pending_idx ON live_stream_reports(created_at ASC,id ASC) WHERE status='pending_review';
GRANT SELECT,INSERT,UPDATE ON live_stream_reports TO nsa_app;
CREATE OR REPLACE FUNCTION expire_source_ingestion_items() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE affected integer;
BEGIN
 DELETE FROM source_ingestion_items WHERE status='pending_review' AND retention_until<=now();
 GET DIAGNOSTICS affected = ROW_COUNT;
 RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION expire_source_ingestion_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_source_ingestion_items() TO nsa_worker;
COMMIT;
