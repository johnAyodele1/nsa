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


-- Backfill the existing review backlog so unrelated general-news articles
-- disappear from the moderation queue immediately after this migration.
UPDATE source_ingestion_items
SET incident_category = CASE
 WHEN (title || ' ' || summary) ~* '\m(kidnapp(ed|ing)?|abduct(ed|ion)?|held hostage|ransom demand)\M' THEN 'kidnapping'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(terroris(m|t|ts)|insurgent(s|cy)?|boko haram|iswap|suicide bomber|terror attack)\M' THEN 'terrorism'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(ebola|lassa fever|cholera outbreak|mpox outbreak|meningitis outbreak|polio outbreak)\M' THEN 'disease_outbreak'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(bandit(s|ry)?|armed gang|cattle rustl(er|ing))\M' THEN 'banditry'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(shoot(ing|out|ings)?|gunmen|shot dead|opened fire|gunfire)\M' THEN 'shooting'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(armed robber(y|s)?|robber(y|s)?|highway robbery)\M' THEN 'robbery'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(building collapse|structure collapse|collapsed building|collapsed structure)\M' THEN 'building_collapse'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(fire outbreak|building fire|market fire|warehouse fire|explosion|blaze)\M' THEN 'fire'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(flood(ing|ed)?|flash flood|flood alert)\M' THEN 'flooding'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(disease outbreak|virus outbreak|fever outbreak|epidemic|public health emergency)\M' THEN 'disease_outbreak'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(riot(s|ing)?|violent clash(es)?|communal clash(es)?|ethnic clash(es)?|violent protest(s)?)\M' THEN 'public_disturbance'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(assault(ed)?|stab(bed|bing)|beaten to death)\M' THEN 'assault'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(road accident|vehicle collision|truck crash|bus crash|car crash|crash claims? lives)\M' THEN 'road_accident'::incident_category
 WHEN (title || ' ' || summary) ~* '\m(missing person|person reported missing|missing child)\M' THEN 'missing_person'::incident_category
 END,
 priority = CASE
 WHEN (title || ' ' || summary) ~* '\m(kidnapp(ed|ing)?|abduct(ed|ion)?|held hostage|ransom demand|terroris(m|t|ts)|insurgent(s|cy)?|boko haram|iswap|suicide bomber|terror attack|ebola|lassa fever|cholera outbreak|mpox outbreak|meningitis outbreak|polio outbreak|bandit(s|ry)?|armed gang|cattle rustl(er|ing))\M' THEN 'critical'
 WHEN (title || ' ' || summary) ~* '\m(shoot(ing|out|ings)?|gunmen|shot dead|opened fire|gunfire|robber(y|s)?|building collapse|structure collapse|fire outbreak|market fire|warehouse fire|explosion|blaze|flood(ing|ed)?|flash flood|epidemic|public health emergency|riot(s|ing)?|violent clash(es)?|communal clash(es)?|ethnic clash(es)?)\M' THEN 'high'
 ELSE 'medium'
 END,
 relevance_score = CASE
 WHEN (title || ' ' || summary) ~* '\m(kidnapp(ed|ing)?|abduct(ed|ion)?|held hostage|ransom demand|terroris(m|t|ts)|insurgent(s|cy)?|boko haram|iswap|suicide bomber|terror attack|ebola|lassa fever|cholera outbreak|mpox outbreak|meningitis outbreak|polio outbreak|bandit(s|ry)?|armed gang|cattle rustl(er|ing))\M' THEN 96
 WHEN (title || ' ' || summary) ~* '\m(shoot(ing|out|ings)?|gunmen|shot dead|opened fire|gunfire|robber(y|s)?|building collapse|structure collapse|fire outbreak|market fire|warehouse fire|explosion|blaze|flood(ing|ed)?|flash flood|epidemic|public health emergency|riot(s|ing)?|violent clash(es)?|communal clash(es)?|ethnic clash(es)?)\M' THEN 84
 ELSE 68
 END
WHERE status='pending_review'
 AND (title || ' ' || summary) ~* '\m(kidnapp(ed|ing)?|abduct(ed|ion)?|held hostage|ransom demand|terroris(m|t|ts)|insurgent(s|cy)?|boko haram|iswap|suicide bomber|terror attack|ebola|lassa fever|cholera outbreak|mpox outbreak|meningitis outbreak|polio outbreak|bandit(s|ry)?|armed gang|cattle rustl(er|ing)|shoot(ing|out|ings)?|gunmen|shot dead|opened fire|gunfire|robber(y|s)?|building collapse|structure collapse|collapsed building|collapsed structure|fire outbreak|building fire|market fire|warehouse fire|explosion|blaze|flood(ing|ed)?|flash flood|flood alert|disease outbreak|virus outbreak|fever outbreak|epidemic|public health emergency|riot(s|ing)?|violent clash(es)?|communal clash(es)?|ethnic clash(es)?|violent protest(s)?|assault(ed)?|stab(bed|bing)|beaten to death|road accident|vehicle collision|truck crash|bus crash|car crash|crash claims? lives|missing person|person reported missing|missing child)\M';

CREATE INDEX IF NOT EXISTS source_ingestion_priority_queue_idx
 ON source_ingestion_items(priority,created_at,id)
 WHERE status='pending_review' AND priority IS NOT NULL;

CREATE INDEX IF NOT EXISTS incidents_public_priority_idx
 ON incidents(priority,published_at DESC,id DESC)
 WHERE status='published' AND deleted_at IS NULL;

COMMIT;
