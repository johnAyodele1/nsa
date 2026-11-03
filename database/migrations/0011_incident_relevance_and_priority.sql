BEGIN;

ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'disease_outbreak';
ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'terrorism';
ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'shooting';
ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'banditry';

ALTER TABLE source_ingestion_items
 ADD COLUMN IF NOT EXISTS incident_category incident_category,
 ADD COLUMN IF NOT EXISTS priority varchar(8) CHECK(priority IN ('critical','high','medium')),
 ADD COLUMN IF NOT EXISTS relevance_score smallint CHECK(relevance_score BETWEEN 0 AND 100),
 ADD COLUMN IF NOT EXISTS matched_terms text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS detected_state varchar(64),
 ADD COLUMN IF NOT EXISTS classification_reason varchar(500);

ALTER TABLE incidents
 ADD COLUMN IF NOT EXISTS priority varchar(8) NOT NULL DEFAULT 'medium'
 CHECK(priority IN ('critical','high','medium'));

CREATE INDEX IF NOT EXISTS source_ingestion_priority_queue_idx
 ON source_ingestion_items(priority,created_at,id)
 WHERE status='pending_review' AND priority IS NOT NULL;

CREATE INDEX IF NOT EXISTS incidents_public_priority_idx
 ON incidents(priority,published_at DESC,id DESC)
 WHERE status='published' AND deleted_at IS NULL;

COMMIT;
