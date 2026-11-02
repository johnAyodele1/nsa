# Nigeria Security Alerts (NSA)

Nigeria-focused public-safety information platform. Web, Android and iOS clients share one Express API, PostgreSQL database and Zod contracts.

## Workspace
- `apps/web`: responsive Next.js website.
- `apps/mobile`: Expo React Native application for Android and iOS.
- `apps/api`: Express 5 API, PostgreSQL access, request validation and API tests.
- `packages/contracts`: shared Zod request/response contracts.
- `database/migrations`: PostgreSQL schema and moderation audit records.
- `apps/worker`: ingestion policy boundary; no scraper or auto-publisher is enabled.

## Local development
Requires Node.js 22.12+, pnpm 10+, Docker.

```sh
corepack enable
pnpm install
cp .env.example .env
docker compose up -d db
pnpm dev:api
```

In separate terminals run `pnpm dev:web` and `pnpm dev:mobile`. For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP, not localhost.

## Quality checklist
- [x] Express 5 replaces Fastify.
- [x] API factory is injectable for HTTP tests.
- [x] Helmet security headers, explicit CORS allowlist, JSON body limit and API rate limit.
- [x] PostgreSQL connection pool has bounded connections/timeouts and graceful shutdown.
- [x] Incident query parameters are validated before database access.
- [x] Feed returns published records only and uses composite keyset pagination.
- [x] Shared response schema validates outgoing feed data.
- [x] API tests cover health, invalid filters, pagination cursor, malformed cursor and 404.
- [ ] Run dependency installation, typecheck, tests and builds in CI; fix every failure before calling this milestone verified.
- [ ] Add real PostgreSQL integration tests and migration verification.
- [ ] Add authenticated report submission, moderation console and authorization tests.
- [ ] Add source registry and reviewed ingestion adapters.
- [ ] Verify agency directory details from official primary sources.
- [ ] Complete security, privacy, legal and operational readiness reviews.

## Safety and launch gates
NSA is independent, not a government agency or emergency dispatch service. SOS, dispatch and live streaming are not operational. No fake incidents or agency contacts are seeded. Reports must remain private/pending until human review; one social post is not verification. Never publish reporter identity, phone number, home address or precise live location. Ingestion must use approved public feeds/APIs and respect terms, robots directives, rate limits, copyright and privacy. No access-control, login, paywall or CAPTCHA bypass. Media requires rights clearance, malware scanning, metadata stripping and moderation.

Before public launch: Nigerian privacy/legal review including NDPA 2023, DPIA where appropriate, retention and breach processes, moderation staffing, verified escalation contacts, security testing, and app-store disclosures. This repository is an engineering foundation, not a launch-ready emergency-response system.
