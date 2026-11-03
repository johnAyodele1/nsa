-- Seed a small, discoverable set of Nigerian publisher RSS feeds.
-- These rows intentionally remain pending: an operator must verify each
-- publisher's current feed terms and robots policy before approving ingestion.
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
    'Channels Television',
    'Channels Television — Latest News',
    'https://www.channelstv.com/',
    'https://www.channelstv.com/feed/',
    'rss',
    'https://www.channelstv.com/',
    'Attribute Channels Television and link to the original article. Do not republish full article text.',
    false,
    900,
    90,
    'pending'
  ),
  (
    'Premium Times',
    'Premium Times — Latest News',
    'https://www.premiumtimesng.com/',
    'https://www.premiumtimesng.com/feed',
    'rss',
    'https://www.premiumtimesng.com/',
    'Attribute Premium Times and link to the original article. Do not republish full article text.',
    false,
    900,
    90,
    'pending'
  ),
  (
    'The Punch',
    'The Punch — Latest News',
    'https://punchng.com/',
    'https://rss.punchng.com/v1/category/latest_news',
    'rss',
    'https://rss.punchng.com/',
    'Attribute The Punch and link to the original article. Do not republish full article text.',
    false,
    900,
    90,
    'pending'
  ),
  (
    'Vanguard',
    'Vanguard — Latest News',
    'https://www.vanguardngr.com/',
    'https://www.vanguardngr.com/feed/',
    'rss',
    'https://www.vanguardngr.com/',
    'Attribute Vanguard and link to the original article. Do not republish full article text.',
    false,
    900,
    90,
    'pending'
  )
ON CONFLICT (feed_url) DO NOTHING;

COMMIT;
