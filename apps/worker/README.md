# Public feed ingestion worker

This worker polls only source registry entries that have been explicitly approved, have a positive robots review, and have documented terms review. It supports RSS 2.0, Atom and JSON Feed 1.0/1.1. It does not scrape article pages, bypass controls, download media, or publish incidents.

## Required configuration

- `WORKER_DATABASE_URL`: dedicated login with membership in the `nsa_worker` database role. Never reuse the API or migration credentials.
- Node.js 22.12 or later.

## Network and parsing controls

- HTTPS only; no credentials, non-443 ports, localhost, private/reserved IPs, or mixed public/private DNS answers.
- DNS results are checked and pinned into the connection dispatcher to reduce DNS-rebinding/SSRF exposure.
- Redirects are manual, capped at three, and every destination is validated again.
- Response size is capped at 1 MB; connect/header/body timeouts are bounded; only XML/JSON content types are accepted.
- ETag and Last-Modified validators are used. A source is leased with `FOR UPDATE SKIP LOCKED`; worker instances do not poll the same source concurrently.
- Parse errors use bounded backoff. Feed HTML is reduced to plain text, script/style blocks are removed, and article body/media are not stored.
- Duplicate source items are rejected by a unique (source, external ID) constraint.

The worker does not independently crawl robots.txt. A trained source reviewer must verify robots policy and source terms, record those reviews, and approve the source in the source registry before it becomes eligible.

## Source onboarding

A source must be a public RSS/Atom feed or documented API whose licence/terms allow the intended use. Verify publisher ownership, terms, robots rules, attribution, allowed metadata fields, rate limits, retention, and a contact route. Use the reviewed source registry; do not insert arbitrary feed URLs from user reports.

For JSON APIs, the endpoint must return JSON Feed 1.0/1.1. Other API schemas require a reviewed adapter, not a permissive generic parser.

## Human review

New items enter `source_ingestion_items` with `pending_review`. They are leads, not verified incidents. A moderator must verify event details, locality, date, source independence, privacy and rights before publication. Do not copy full article text or images without permission. No automatic publishing exists.
