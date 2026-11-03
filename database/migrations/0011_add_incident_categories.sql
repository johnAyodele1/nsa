-- Add new incident categories in their own migration. PostgreSQL requires
-- a transaction boundary before newly-added enum labels can be used.
ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'disease_outbreak';
ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'terrorism';
ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'shooting';
ALTER TYPE incident_category ADD VALUE IF NOT EXISTS 'banditry';
