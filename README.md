# Nigeria Security Alerts (NSA)

Nigeria-focused public-safety information platform. Web, Android and iOS clients share one Express API, PostgreSQL database and Zod contracts.

## Workspace
- `apps/web`: responsive Next.js website.
- `apps/mobile`: Expo React Native application for Android and iOS.
- `apps/api`: Express 5 API, PostgreSQL access, transactional migrations and API tests.
- `packages/contracts`: shared Zod request/response contracts.
- `database/migrations`: PostgreSQL schema, source registry and moderation audit records.
- `apps/worker`: ingestion policy boundary; no scraper or auto-publisher is enabled.
- `docs/BUILD_CHECKLIST.md`: cross-checked delivery checklist and outstanding work.

## Local development
Requires Node.js 22.12+, pnpm 10+, Docker.

```sh
corepack enable
pnpm install
cp .env.example .env
docker compose up -d db
pnpm --filter @nsa/api db:migrate
pnpm dev:api
```

In separate terminals run `pnpm dev:web` and `pnpm dev:mobile`. For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP, not localhost.

## Current verified baseline
- Express 5 API with injectable app factory, Helmet, CORS allowlist, bounded JSON bodies and API rate limiting.
- PostgreSQL pool with connection and statement timeouts.
- Advisory-locked, transactional, idempotent SQL migration runner.
- Nigeria-only state validation at the database boundary.
- Source registry requires source terms and robots review before approval.
- Published incidents require moderator review, a non-unverified status and at least one public source.
- Incident feed uses parameterized SQL, shared Zod response validation and timestamp/id keyset pagination.
- CI runs TypeScript checks, unit tests, PostgreSQL integration tests against an empty PostgreSQL 17 service, and application builds.

## Safety and launch gates
NSA is independent, not a government agency or emergency dispatch service. SOS, dispatch and live streaming are not operational. No fake incidents or agency contacts are seeded. Reports must remain private/pending until human review; one social post is not verification. Never publish reporter identity, phone number, home address or precise live location. Ingestion must use approved public feeds/APIs and respect terms, robots directives, rate limits, copyright and privacy. No access-control, login, paywall or CAPTCHA bypass. Media requires rights clearance, malware scanning, metadata stripping and moderation.

Before public launch: Nigerian privacy/legal review including NDPA 2023, DPIA where appropriate, retention and breach processes, moderation staffing, verified escalation contacts, security testing, and app-store disclosures. This repository is an engineering foundation, not a launch-ready emergency-response system.
