BEGIN;
CREATE TYPE agency_contact_type AS ENUM ('emergency','hotline','office');

CREATE TABLE agency_directory(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug varchar(80) NOT NULL UNIQUE,
 name varchar(180) NOT NULL,
 acronym varchar(24),
 scope varchar(80) NOT NULL,
 description varchar(1000) NOT NULL,
 official_website text NOT NULL CHECK(official_website LIKE 'https://%'),
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 source_verified_at timestamptz NOT NULL,
 next_review_at timestamptz NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(next_review_at>source_verified_at)
);
CREATE TABLE agency_contacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agency_id uuid NOT NULL REFERENCES agency_directory(id) ON DELETE CASCADE,
 label varchar(100) NOT NULL,
 phone_number varchar(20) NOT NULL CHECK(phone_number ~ '^(\\+234[0-9]{7,10}|[0-9]{3,6})$'),
 contact_type agency_contact_type NOT NULL,
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 verified_at timestamptz NOT NULL,
 display_order smallint NOT NULL DEFAULT 0 CHECK(display_order>=0),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agency_id,phone_number)
);
CREATE INDEX agency_directory_active_idx ON agency_directory(scope,name) WHERE is_active IS TRUE;
CREATE INDEX agency_contacts_active_idx ON agency_contacts(agency_id,display_order) WHERE is_active IS TRUE;

INSERT INTO agency_directory(slug,name,acronym,scope,description,official_website,source_url,source_verified_at,next_review_at) VALUES
('lasema','Lagos State Emergency Management Agency','LASEMA','Lagos State','Coordinates emergency response and disaster management within Lagos State.','https://lasema.com.ng','https://lasema.com.ng/contact/','2026-11-02T00:00:00Z','2026-12-02T00:00:00Z'),
('efcc','Economic and Financial Crimes Commission','EFCC','National','Receives reports and investigates economic and financial crimes. This is not a general emergency response service.','https://www.efcc.gov.ng','https://www.efcc.gov.ng/','2026-11-02T00:00:00Z','2026-12-02T00:00:00Z'),
('nscdc','Nigeria Security and Civil Defence Corps','NSCDC','National','Civil defence, protection of critical national assets and security incident reporting.','https://nscdc.gov.ng','https://nscdc.gov.ng/','2026-11-02T00:00:00Z','2026-12-02T00:00:00Z'),
('npf-lagos-command','Nigeria Police Force — Lagos Command','NPF','Lagos State','Lagos Command emergency contact lines published by the Nigeria Police Force.','https://lagos.npf.gov.ng','https://lagoscommand.npf.gov.ng/news/details/812','2026-11-02T00:00:00Z','2026-12-02T00:00:00Z')
ON CONFLICT(slug) DO NOTHING;

INSERT INTO agency_contacts(agency_id,label,phone_number,contact_type,source_url,verified_at,display_order)
SELECT id,'Lagos emergency line (112)','112','emergency','https://lasema.com.ng/contact/','2026-11-02T00:00:00Z',1 FROM agency_directory WHERE slug='lasema'
UNION ALL SELECT id,'Lagos emergency line (767)','767','emergency','https://lasema.com.ng/contact/','2026-11-02T00:00:00Z',2 FROM agency_directory WHERE slug='lasema'
UNION ALL SELECT id,'LASEMA office contact','+2347035438447','office','https://lasema.com.ng/contact/','2026-11-02T00:00:00Z',3 FROM agency_directory WHERE slug='lasema'
UNION ALL SELECT id,'EFCC hotline','+2348093322644','hotline','https://www.efcc.gov.ng/','2026-11-02T00:00:00Z',1 FROM agency_directory WHERE slug='efcc'
UNION ALL SELECT id,'NSCDC emergency hotline','199','emergency','https://nscdc.gov.ng/','2026-11-02T00:00:00Z',1 FROM agency_directory WHERE slug='nscdc'
UNION ALL SELECT id,'NSCDC incident reporting','+23492914164','hotline','https://nscdc.gov.ng/','2026-11-02T00:00:00Z',2 FROM agency_directory WHERE slug='nscdc'
UNION ALL SELECT id,'Lagos Police emergency line 1','08057000001','emergency','https://lagoscommand.npf.gov.ng/news/details/812','2026-11-02T00:00:00Z',1 FROM agency_directory WHERE slug='npf-lagos-command'
UNION ALL SELECT id,'Lagos Police emergency line 2','08057000002','emergency','https://lagoscommand.npf.gov.ng/news/details/812','2026-11-02T00:00:00Z',2 FROM agency_directory WHERE slug='npf-lagos-command'
UNION ALL SELECT id,'Lagos Police emergency line 3','09133333785','emergency','https://lagoscommand.npf.gov.ng/news/details/812','2026-11-02T00:00:00Z',3 FROM agency_directory WHERE slug='npf-lagos-command'
UNION ALL SELECT id,'Lagos Police emergency line 4','09133333786','emergency','https://lagoscommand.npf.gov.ng/news/details/812','2026-11-02T00:00:00Z',4 FROM agency_directory WHERE slug='npf-lagos-command'
ON CONFLICT(agency_id,phone_number) DO NOTHING;

REVOKE ALL ON agency_directory,agency_contacts FROM PUBLIC;
COMMIT;
