BEGIN;
CREATE TABLE emergency_contacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 country_code char(2) NOT NULL CHECK(country_code='NG'),
 state varchar(64) CHECK(state IS NULL OR state IN ('Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','Federal Capital Territory')),
 agency_name varchar(180) NOT NULL,
 label varchar(120) NOT NULL,
 phone_number varchar(20) NOT NULL CHECK(phone_number ~ '^([+]234[0-9]{7,10}|[0-9]{3,6})$'),
 scope varchar(80) NOT NULL,
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 verified_at timestamptz NOT NULL,
 next_review_at timestamptz NOT NULL CHECK(next_review_at>verified_at),
 priority smallint NOT NULL DEFAULT 100 CHECK(priority BETWEEN 1 AND 1000),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state IS NULL AND scope='National') OR state IS NOT NULL)
);
CREATE UNIQUE INDEX emergency_contacts_unique_idx ON emergency_contacts(country_code,COALESCE(state,''),phone_number);
CREATE INDEX emergency_contacts_active_lookup_idx ON emergency_contacts(country_code,state,priority) WHERE is_active IS TRUE;
INSERT INTO emergency_contacts(country_code,state,agency_name,label,phone_number,scope,source_url,verified_at,next_review_at,priority) VALUES
('NG',NULL,'Nigeria Emergency Communications Centre','National emergency line','112','National','https://ncc.gov.ng/node/3132',TIMESTAMPTZ '2026-11-02T00:00:00Z',TIMESTAMPTZ '2026-12-02T00:00:00Z',1),
('NG','Lagos','Lagos State Emergency Management Agency','Lagos emergency line','767','Lagos State','https://www.lagosstate.gov.ng/connect',TIMESTAMPTZ '2026-11-02T00:00:00Z',TIMESTAMPTZ '2026-12-02T00:00:00Z',2)
ON CONFLICT DO NOTHING;
UPDATE agency_contacts c SET is_active=false FROM agency_directory a
 WHERE a.id=c.agency_id AND (a.slug='npf-lagos-command' OR (a.slug='nscdc' AND c.phone_number='199'));
REVOKE ALL ON emergency_contacts FROM PUBLIC;
GRANT SELECT ON emergency_contacts TO nsa_app;
COMMIT;
