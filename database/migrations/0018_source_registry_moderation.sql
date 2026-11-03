BEGIN;

CREATE TABLE source_registry_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_registry_id uuid NOT NULL REFERENCES source_registry(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 action varchar(16) NOT NULL CHECK(action IN ('approve','reject','suspend')),
 reason varchar(1000) NOT NULL CHECK(char_length(reason)>=10),
 robots_allowed boolean,
 terms_reviewed boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_registry_audit_source_idx ON source_registry_audit(source_registry_id,created_at DESC);
CREATE TRIGGER source_registry_audit_append_only
 BEFORE UPDATE OR DELETE ON source_registry_audit
 FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

GRANT SELECT,INSERT ON source_registry_audit TO nsa_app;
GRANT UPDATE(robots_checked_at,robots_allowed,terms_reviewed_at,approval_status,approved_by,approved_at,updated_at)
 ON source_registry TO nsa_app;

COMMIT;
