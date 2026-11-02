BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE incident_category AS ENUM ('robbery','theft','kidnapping','assault','fire','road_accident','flooding','building_collapse','public_disturbance','missing_person','other');
CREATE TYPE verification_status AS ENUM ('unverified','corroborated','officially_confirmed');
CREATE TYPE publication_status AS ENUM ('pending_review','published','rejected','archived');
CREATE TABLE incidents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title varchar(180) NOT NULL CHECK(char_length(title)>=8),
 summary varchar(2000) NOT NULL CHECK(char_length(summary)>=20),category incident_category NOT NULL,
 state varchar(64) NOT NULL,locality varchar(120),occurred_at timestamptz NOT NULL,published_at timestamptz,
 verification_status verification_status NOT NULL DEFAULT 'unverified',status publication_status NOT NULL DEFAULT 'pending_review',
 source_count integer NOT NULL DEFAULT 0 CHECK(source_count>=0),public_source_url text,reviewed_by uuid,reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 CHECK(status<>'published' OR (published_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE INDEX incidents_public_feed_idx ON incidents(published_at DESC,id DESC) WHERE status='published' AND deleted_at IS NULL;
CREATE INDEX incidents_state_feed_idx ON incidents(state,published_at DESC) WHERE status='published' AND deleted_at IS NULL;
CREATE INDEX incidents_category_feed_idx ON incidents(category,published_at DESC) WHERE status='published' AND deleted_at IS NULL;
CREATE TABLE incident_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
 source_name varchar(160) NOT NULL,source_url text NOT NULL,source_published_at timestamptz,
 rights_review_status varchar(24) NOT NULL DEFAULT 'pending' CHECK(rights_review_status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(incident_id,source_url)
);
CREATE TABLE moderation_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),incident_id uuid NOT NULL REFERENCES incidents(id),
 actor_id uuid NOT NULL,action varchar(32) NOT NULL CHECK(action IN ('approve','reject','archive','edit')),
 reason varchar(1000),created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON incidents,incident_sources,moderation_audit FROM PUBLIC;
COMMIT;
