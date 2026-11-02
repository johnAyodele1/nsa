BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE incident_category AS ENUM ('robbery','theft','kidnapping','assault','fire','road_accident','flooding','building_collapse','public_disturbance','missing_person','other');
CREATE TYPE verification_status AS ENUM ('unverified','corroborated','officially_confirmed');
CREATE TYPE publication_status AS ENUM ('pending_review','published','rejected','archived');
CREATE TYPE source_kind AS ENUM ('rss','atom','api');
CREATE TYPE source_approval_status AS ENUM ('pending','approved','suspended','rejected');

CREATE TABLE source_registry(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 publisher_name varchar(160) NOT NULL,
 display_name varchar(160) NOT NULL,
 canonical_url text NOT NULL UNIQUE CHECK(canonical_url LIKE 'https://%'),
 feed_url text NOT NULL UNIQUE CHECK(feed_url LIKE 'https://%'),
 source_kind source_kind NOT NULL,
 terms_url text CHECK(terms_url IS NULL OR terms_url LIKE 'https://%'),
 licence_name varchar(160),
 attribution_text varchar(500),
 is_official boolean NOT NULL DEFAULT false,
 polling_interval_seconds integer NOT NULL DEFAULT 1800 CHECK(polling_interval_seconds BETWEEN 300 AND 86400),
 retention_days integer NOT NULL DEFAULT 90 CHECK(retention_days BETWEEN 1 AND 3650),
 robots_checked_at timestamptz,
 robots_allowed boolean,
 terms_reviewed_at timestamptz,
 approval_status source_approval_status NOT NULL DEFAULT 'pending',
 approved_by uuid,
 approved_at timestamptz,
 last_checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(approval_status<>'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND robots_checked_at IS NOT NULL AND robots_allowed IS TRUE AND terms_reviewed_at IS NOT NULL))
);

CREATE TABLE incidents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title varchar(180) NOT NULL CHECK(char_length(title)>=8),
 summary varchar(2000) NOT NULL CHECK(char_length(summary)>=20),
 category incident_category NOT NULL,
 state varchar(64) NOT NULL CHECK(state IN ('Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','Federal Capital Territory')),
 locality varchar(120),
 occurred_at timestamptz NOT NULL,
 published_at timestamptz,
 verification_status verification_status NOT NULL DEFAULT 'unverified',
 status publication_status NOT NULL DEFAULT 'pending_review',
 source_count integer NOT NULL DEFAULT 0 CHECK(source_count>=0),
 public_source_url text CHECK(public_source_url IS NULL OR public_source_url LIKE 'https://%'),
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 CHECK(status<>'published' OR (published_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND verification_status<>'unverified' AND source_count>=1 AND public_source_url IS NOT NULL))
);
CREATE INDEX incidents_public_feed_idx ON incidents(published_at DESC,id DESC) WHERE status='published' AND deleted_at IS NULL;
CREATE INDEX incidents_state_feed_idx ON incidents(state,published_at DESC,id DESC) WHERE status='published' AND deleted_at IS NULL;
CREATE INDEX incidents_category_feed_idx ON incidents(category,published_at DESC,id DESC) WHERE status='published' AND deleted_at IS NULL;

CREATE TABLE incident_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
 source_registry_id uuid REFERENCES source_registry(id) ON DELETE RESTRICT,
 source_name varchar(160) NOT NULL,
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 source_published_at timestamptz,
 rights_review_status varchar(24) NOT NULL DEFAULT 'pending' CHECK(rights_review_status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(incident_id,source_url)
);
CREATE INDEX incident_sources_registry_idx ON incident_sources(source_registry_id);

CREATE TABLE moderation_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES incidents(id),
 actor_id uuid NOT NULL,
 action varchar(32) NOT NULL CHECK(action IN ('approve','reject','archive','edit')),
 reason varchar(1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_audit_incident_idx ON moderation_audit(incident_id,created_at DESC);

REVOKE ALL ON source_registry,incidents,incident_sources,moderation_audit FROM PUBLIC;
COMMIT;
