BEGIN;
CREATE TYPE app_role AS ENUM ('member','moderator','admin');
CREATE TYPE report_status AS ENUM ('pending_review','approved','rejected');

CREATE TABLE app_users(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 auth_subject varchar(255) NOT NULL UNIQUE,
 role app_role NOT NULL DEFAULT 'member',
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incident_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 title varchar(180) NOT NULL CHECK(char_length(title)>=8),
 summary varchar(2000) NOT NULL CHECK(char_length(summary)>=20),
 category incident_category NOT NULL,
 state varchar(64) NOT NULL CHECK(state IN ('Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','Federal Capital Territory')),
 locality varchar(120),
 occurred_at timestamptz NOT NULL,
 source_url text CHECK(source_url IS NULL OR source_url LIKE 'https://%'),
 status report_status NOT NULL DEFAULT 'pending_review',
 incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status='pending_review' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX incident_reports_pending_idx ON incident_reports(created_at ASC) WHERE status='pending_review';
CREATE INDEX incident_reports_reporter_idx ON incident_reports(reporter_id,created_at DESC);

CREATE TABLE report_moderation_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES incident_reports(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 action varchar(16) NOT NULL CHECK(action IN ('approve','reject')),
 reason varchar(1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_moderation_audit_report_idx ON report_moderation_audit(report_id,created_at DESC);
ALTER TABLE moderation_audit ADD CONSTRAINT moderation_audit_actor_fk FOREIGN KEY(actor_id) REFERENCES app_users(id) ON DELETE RESTRICT;

REVOKE ALL ON app_users,incident_reports,report_moderation_audit FROM PUBLIC;
COMMIT;
