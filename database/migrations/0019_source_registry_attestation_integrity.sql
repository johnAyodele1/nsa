BEGIN;

-- A source without a registered terms URL cannot carry a positive terms review.
-- NOT VALID preserves historical rows while enforcing this rule for all future
-- writes; polling and evidence selection also explicitly require terms_url.
ALTER TABLE source_registry
 ADD CONSTRAINT source_registry_approved_terms_url_check
 CHECK (approval_status <> 'approved' OR terms_url IS NOT NULL) NOT VALID;

DROP INDEX IF EXISTS source_registry_due_idx;
CREATE INDEX source_registry_due_idx
 ON source_registry(next_poll_at,id)
 WHERE approval_status='approved'
   AND robots_allowed IS TRUE
   AND robots_checked_at IS NOT NULL
   AND terms_reviewed_at IS NOT NULL
   AND terms_url IS NOT NULL;

ALTER TABLE source_registry_audit
 DROP CONSTRAINT IF EXISTS source_registry_audit_action_check,
 ADD CONSTRAINT source_registry_audit_action_check
 CHECK (action IN ('approve','reject'));

ALTER TABLE source_registry_audit
 DROP CONSTRAINT IF EXISTS source_registry_audit_reason_check,
 ADD CONSTRAINT source_registry_audit_reason_check
 CHECK (char_length(btrim(reason)) BETWEEN 10 AND 1000);

COMMIT;
