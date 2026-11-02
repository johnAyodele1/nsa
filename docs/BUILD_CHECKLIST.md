# NSA delivery checklist

This checklist is the source of truth for implementation progress. A checkbox is only completed when the implementation exists on the feature branch and the relevant automated/manual check has been observed passing. A commit is not proof of correctness.

## Foundation
- [x] Monorepo separates web, mobile, API, shared contracts and database migrations.
- [x] Web and mobile consume the same API contract.
- [x] Express 5 is the only HTTP server framework; Fastify is removed.
- [x] PostgreSQL is the persistent data store.
- [x] No fabricated incident records or agency contact details are seeded.
- [x] SOS and live streaming are clearly non-operational until the complete responder workflow exists.

## API and data safety
- [x] Express app is injectable so HTTP tests can run without binding a port.
- [x] Helmet security headers are enabled.
- [x] CORS uses an explicit origin allowlist.
- [x] JSON request body size is bounded.
- [x] API requests have a rate limit.
- [x] Database pool has connection and statement timeouts.
- [x] API has separate liveness and database-readiness endpoints.
- [x] Query parameters are validated before SQL execution.
- [x] SQL values are parameterized.
- [x] Feed query excludes unpublished and soft-deleted incidents.
- [x] Feed pagination uses a composite timestamp/id cursor.
- [x] API response is checked against the shared Zod schema.
- [x] PostgreSQL integration tests run against the real migration.
- [x] Migrations are applied from an empty PostgreSQL database in CI and verified as idempotent.
- [ ] Add database role separation and explicit least-privilege grants.
- [ ] Add request correlation IDs and structured production logging.
- [ ] Add API authentication, authorization and abuse controls before accepting reports.
- [ ] Add secure report intake with private reporter data separated from public incident content.
- [ ] Add moderation workflow with immutable audit events and role checks.

## Automated quality gates
- [ ] pnpm install --frozen-lockfile succeeds from a committed lockfile.
- [x] pnpm typecheck passes on the current branch.
- [x] pnpm test passes on the current branch, including PostgreSQL integration tests.
- [x] pnpm build passes on the current branch.
- [ ] Expo dependency compatibility check passes.
- [ ] Web and mobile smoke tests pass.
- [x] CI is green on the latest PR head (typecheck, tests and builds).

## Public information and verification
- [x] Source registry schema records publisher, canonical/feed URLs, terms, licence, attribution, polling interval, retention and robots review.
- [ ] Only approved public feeds/APIs are ingested.
- [ ] Ingested claims remain pending until human review.
- [ ] Corroboration and official confirmation have distinct documented criteria.
- [ ] Agency directory entries are verified against official agency-owned sources.
- [ ] Media rights, malware scanning, metadata removal and moderation are implemented.

## Emergency features and launch
- [ ] SOS is designed with consent, location expiry, revocation, authorized recipients and audit trails.
- [ ] A staffed response/escalation operation exists before SOS is enabled.
- [ ] Live video has access control, retention limits, abuse handling and bandwidth controls.
- [ ] NDPA 2023/privacy review, DPIA where appropriate, retention and breach plans are complete.
- [ ] App Store and Play Store privacy disclosures, permission rationale and account deletion are complete.
- [ ] Independent security review and incident-response exercise are complete.

## Working rules
1. Work on a feature branch; never push application changes directly to main.
2. Never mark a task complete based on intention or a successful commit alone.
3. Every bug found by CI becomes a tracked fix, followed by a fresh CI run.
4. Do not enable an emergency feature that cannot safely deliver its stated outcome.
5. Keep web, Android and iOS behavior aligned through shared contracts and API integration tests.
