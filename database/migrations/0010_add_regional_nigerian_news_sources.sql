-- Add more state/regional and specialist Nigerian publisher candidates.
-- These are discovery candidates only. They remain pending until endpoint,
-- terms, robots, attribution and parser checks have been completed.
BEGIN;

INSERT INTO source_registry (
  publisher_name,
  display_name,
  canonical_url,
  feed_url,
  source_kind,
  terms_url,
  attribution_text,
  is_official,
  polling_interval_seconds,
  retention_days,
  approval_status
)
VALUES
  (
    'Leadership',
    'Leadership Newspaper — Latest News',
    'https://leadership.ng/',
    'https://leadership.ng/feed/',
    'rss',
    'https://leadership.ng/',
    'Attribute Leadership Newspaper and link to the original article. Do not republish full article text.',
    false,
    900,
    90,
    'pending'
  ),
  (
    'Nigerian Bulletin',
    'Nigerian Bulletin — News Forum Feed',
    'https://www.nigerianbulletin.com/',
    'https://www.nigerianbulletin.com/forums/-/index.rss',
    'rss',
    'https://www.nigerianbulletin.com/',
    'Attribute Nigerian Bulletin and link to the original discussion or article. Do not republish full user-generated posts.',
    false,
    1800,
    90,
    'pending'
  ),
  (
    'NigerianEye',
    'NigerianEye — Latest News',
    'https://www.nigerianeye.com/',
    'https://www.nigerianeye.com/feeds/posts/default',
    'rss',
    'https://www.nigerianeye.com/',
    'Attribute NigerianEye and link to the original article. Do not republish full article text.',
    false,
    1800,
    90,
    'pending'
  ),
  (
    'The Tide',
    'The Tide — Rivers State News',
    'https://www.thetidenewsonline.com/',
    'https://www.thetidenewsonline.com/feed/',
    'rss',
    'https://www.thetidenewsonline.com/',
    'Attribute The Tide and link to the original article. Do not republish full article text.',
    false,
    1800,
    90,
    'pending'
  ),
  (
    'Daily News Reporters',
    'Daily News Reporters — Southeast Nigeria',
    'https://dailynewsreporters.com/',
    'https://dailynewsreporters.com/feed/',
    'rss',
    'https://dailynewsreporters.com/',
    'Attribute Daily News Reporters and link to the original article. Do not republish full article text.',
    false,
    1800,
    90,
    'pending'
  ),
  (
    'Converseer',
    'Converseer — Regional News',
    'https://converseer.com/',
    'https://converseer.com/feed/',
    'rss',
    'https://converseer.com/',
    'Attribute Converseer and link to the original article. Do not republish full article text.',
    false,
    1800,
    90,
    'pending'
  )
ON CONFLICT (feed_url) DO NOTHING;

COMMIT;
