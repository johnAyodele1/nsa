# Ingestion worker boundary

No scraper or publisher is enabled in this bootstrap. Before enabling a source, record its owner, canonical URL, public feed/API endpoint, terms/licence, robots policy, permitted fields, polling interval, rate limit, attribution, retention, and reviewer.

Allowed: explicitly public RSS/Atom feeds and documented APIs whose terms permit the intended use. Prohibited: authentication/paywall/CAPTCHA/access-control bypass; private groups; collecting personal contact details; indiscriminate social-media scraping; copying copyrighted article text or images without permission.

Ingested material is a lead for human review, not a verified incident. Create pending records only. Publication requires reviewer approval, source checks, privacy review, and rights approval. Deduplicate by canonical source URL and normalized event fingerprint; retain source timestamps and provenance.
