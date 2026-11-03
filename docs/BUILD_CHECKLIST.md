# NSA delivery checklist

This checklist is the source of truth for implementation progress. A checkbox is only completed when the implementation exists on the feature branch and the relevant automated/manual check has been observed passing. A commit is not proof of correctness.

## Foundation
- [x] Monorepo separates web, mobile, API, shared contracts and database migrations.
- [x] Web and mobile consume the same API contract.
- [x] Web and mobile expose the same source-linked agency directory API.
- [x] Both clients support Nigeria state/category filters and cursor-based load-more pagination.
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
- [x] PostgreSQL integration tests run against the real migrations.
- [x] Migrations are applied from an empty PostgreSQL database in CI and verified as idempotent/concurrency-safe.
- [x] Add separate nsa_app, nsa_worker, nsa_web and nsa_migrator roles with explicit grants; production login membership and secrets remain deployment tasks.
- [x] Enforce append-only audit records with database triggers and remove UPDATE/DELETE privileges from the API role.
- [x] Generate server-owned request IDs, return `x-request-id`, and emit structured request-completion/error logs without logging query strings or user data.
- [x] Local email/password authentication is covered by API tests for registration, login, invalid credentials, session expiry and revocation.
- [x] Member report submission is authenticated, private, validated and limited to five per account per hour.
- [x] Members can read only their own report statuses.
- [x] Moderator/admin access is checked against database roles.
- [x] Moderation decisions are transactional and audited.
- [x] Web email/password registration and sign-in use a BFF HttpOnly session, encrypted server-side token storage and CSRF validation.
- [x] Native email/password registration and sign-in use iOS Keychain / Android Keystore through SecureStore.
- [x] Bootstrap the first super admin once from `NSA_SUPER_ADMIN_EMAIL` and `NSA_SUPER_ADMIN_PASSWORD` using the dedicated migration database connection.
- [x] Super admin can invite moderator email addresses, list active/invited moderators and revoke moderator access.
- [x] Moderator invitations use a random one-time code (only its SHA-256 hash is stored), expire after seven days, and require the matching email plus code to claim.
- [x] Claiming an invitation for an existing account sets a new password, grants moderator access and revokes all previous sessions.
- [x] Database role-management function enforces an active admin actor; ordinary API users cannot assign roles.
- [x] Local sessions are random, hashed in storage, expire, and can be revoked on sign-out or account deactivation.
- [x] Account erasure clears local credentials and revokes every active session.
- [x] No external OIDC provider, JWKS, callback, client ID or mobile OAuth dependency remains.

## Automated quality gates
- [x] Commit `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` passes after removing external-auth dependencies.
- [x] pnpm typecheck passes on the validated PR head.
- [x] pnpm test passes on the validated PR head, including PostgreSQL 17 integration tests.
- [x] pnpm build passes on the validated PR head.
- [ ] Expo dependency compatibility check passes in CI.
- [ ] Web and mobile device/browser smoke tests pass (native OAuth and Agora require Android/iOS development builds; Expo export alone does not compile native modules).
- [ ] CI is green on the latest local-auth PR head after the session-expiry test update: typecheck, unit tests, PostgreSQL integration tests and builds.

## Public information and verification
- [x] Source registry schema records publisher, canonical/feed URLs, terms, licence, attribution, polling interval, retention and robots review.
- [x] Corroborated reports require two distinct publishers; official confirmation requires an approved official source.
- [x] Worker polls only approved, robots-allowed, robots-reviewed, terms-reviewed public feeds/APIs; no production source is auto-approved.
- [x] Submitted reports remain pending until human review.
- [x] Build RSS/Atom/JSON Feed adapters with HTTPS-only SSRF/DNS-rebinding controls, bounded parsing, conditional requests, backoff and deduplication.
- [x] Keep imported items private in staging; publication requires human review, source independence and a documented rights review.
- [x] Initial agency directory entries are source-linked to official agency-owned pages; contact numbers carry per-entry source links and review dates.
- [ ] Media rights, malware scanning, metadata removal and moderation are implemented.
- [ ] Agora stream recording is not enabled; confirm provider-side recording is disabled and retention/deletion controls before launch.

## Emergency features and launch
- [x] Initial SOS client flow requests foreground location only after explicit user action, displays GPS/address locally, provides verified call links and lets the user read/share location with the operator; precise coordinates are not persisted or transmitted by NSA.
- [ ] Physical Android/iOS SOS tests are signed off using docs/DEVICE_QA_AND_DISPATCH_READINESS.md.
- [ ] A real responder integration is contracted, implemented against the partner's documented API, penetration-tested and operationally rehearsed; no dispatch integration is currently active.
- [ ] Trusted-recipient workflows, explicit location-sharing consent, location expiry/revocation audit and staffed escalation are implemented and tested before dispatch launch.
- [ ] A staffed response/escalation operation exists before SOS is enabled.
- [x] Implement Agora server-side RTC token issuance, broadcaster ownership checks, moderator approval/rejection, active-stream moderation, time-limited sessions, abuse report intake and token renewal; typecheck, unit tests, PostgreSQL integration tests and builds pass on CI run 41497537070. Audience tokens remain disabled unless `AGORA_AUDIENCE_TOKEN_ENABLED=true` is deliberately configured. Web `agora-rtc-sdk-ng` and native `react-native-agora` publisher/viewer clients are implemented; physical-device builds, Agora account configuration, moderation staffing, low-bandwidth validation and launch safety review remain outstanding.
- [ ] NDPA 2023 legal review and DPIA are signed off by qualified privacy counsel/DPO; lawful bases, controller/processor roles, retention schedule, data-subject notices and breach response plan are approved. Engineering preparation is in docs/PRIVACY_NDPA_REVIEW.md.
- [ ] Account deletion request intake, local access disablement, privacy-rights request/status and append-only audit endpoints pass current-branch tests; local auth credentials and sessions are removed on erasure. NDPA review and App Store/Play disclosures remain outstanding.
- [ ] Independent security review and incident-response exercise are complete.

## Working rules
1. Work on a feature branch; never push application changes directly to main.
2. Never mark a task complete based on intention or a successful commit alone.
3. Every bug found by CI becomes a tracked fix, followed by a fresh CI run.
4. Do not enable an emergency feature that cannot safely deliver its stated outcome.
5. Keep web, Android and iOS behavior aligned through shared contracts and API integration tests.
