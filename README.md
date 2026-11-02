# Nigeria Security Alerts (NSA)

Nigeria-focused public-safety information platform. Web, Android and iOS clients share one Express API, PostgreSQL database and Zod contracts.

## Workspace
- `apps/web`: responsive Next.js incident feed, official agency directory, OIDC-backed report form (`/report`) and moderator console (`/moderation`).
- `apps/mobile`: Expo React Native incident feed, official agency directory and OIDC-authenticated report submission for Android and iOS.
- `apps/api`: Express 5 API, OIDC authentication, report intake, moderation endpoints and PostgreSQL access.
- `packages/contracts`: shared Zod request/response contracts.
- `database/migrations`: PostgreSQL schema, approved-source registry, reports, moderation audit and source-linked agency contacts.
- `docs/BUILD_CHECKLIST.md`: cross-checked delivery checklist and remaining work.

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

### Authentication setup
Report submission and moderation are disabled until OIDC is configured. Set the server values and browser client values in `.env`:
- `OIDC_ISSUER_URL`: exact issuer URL from your identity provider.
- `OIDC_JWKS_URL`: HTTPS JSON Web Key Set endpoint.
- `OIDC_AUDIENCE`: API audience expected in access tokens.
- `NEXT_PUBLIC_OIDC_ISSUER_URL`: same HTTPS issuer for browser sign-in.
- `NEXT_PUBLIC_OIDC_CLIENT_ID`: public OIDC client ID configured for authorization-code + PKCE.
- `NEXT_PUBLIC_OIDC_AUDIENCE`: same API audience sent by the web client.
- `EXPO_PUBLIC_OIDC_ISSUER_URL`: HTTPS issuer used by the native authorization-code + PKCE flow.
- `EXPO_PUBLIC_OIDC_CLIENT_ID`: public native OIDC client ID with `nsa://auth/callback` registered as a redirect URI.
- `EXPO_PUBLIC_OIDC_AUDIENCE`: API audience requested by the native client.

Native sign-in redirects to `nsa://auth/callback`. Register that exact redirect URI with the identity provider. Because the app uses a custom native URL scheme, test OAuth on a development build or production build, not Expo Go. Build and install a development client before testing sign-in on a physical Android or iOS device.

The API verifies JWT signatures using the remote JWKS, validates issuer/audience and accepts RS256 or ES256 only. Do not put a client secret or signing private key in this repository. The identity provider owns sign-in and account lifecycle. New authenticated users receive the `member` role; moderator/admin roles must be provisioned by an authorized operator directly in the database. Never expose role assignment to public clients.

## API surface
- `GET /v1/incidents`: published incidents only; supports Nigeria state/category filters and stable cursor pagination.
- `GET /v1/agencies`: official contact directory with contact-level source URLs and review dates.
- `POST /v1/reports`: authenticated report intake. Stores reports privately as pending review; no phone, email or exact coordinates are collected. Maximum five reports per account per hour.
- `GET /v1/reports/mine`: authenticated member's own report status only.
- `GET /v1/moderation/reports`: moderator/admin-only pending queue; reporter identity is not returned.
- `GET /v1/moderation/sources`: moderator/admin-only approved evidence sources.
- `POST /v1/moderation/reports/:reportId/decision`: moderator/admin-only approve/reject. Approval requires reviewed source-registry entries. Corroborated reports need at least two distinct publishers; official confirmation needs an official source entry.

The web report form is available at `/report`; the native report form is available at `/report`; the moderator console is at `/moderation`. Both clients use OIDC authorization-code + PKCE. Browser tokens are session-scoped; native access tokens are stored with iOS Keychain / Android Keystore via SecureStore and expire locally. No refresh token is retained. The API independently validates every token and checks moderator/admin roles. A backend-for-frontend (BFF) cookie session remains a hardening item. Source registry records must currently be provisioned by an authorized operator. Approved RSS/Atom/JSON Feed adapters stage items for human moderation; no automatic publication is enabled.

## Verified engineering baseline
- Express 5 with injectable app, Helmet, explicit CORS allowlist, bounded JSON bodies and API rate limiting.
- PostgreSQL pool with connection and statement timeouts.
- Advisory-locked, transactional, idempotent SQL migration runner.
- Database constraints enforce Nigerian states, reviewed source approval and safe publication prerequisites.
- Authenticated report intake, per-account rate limiting, private report status, role-protected moderation and audit records.
- OIDC verification uses HTTPS JWKS and explicit issuer/audience/algorithm checks.
- CI runs TypeScript checks, unit tests, PostgreSQL integration tests against an empty PostgreSQL 17 service, and workspace builds.

## Safety and launch gates
NSA is independent, not a government agency or emergency dispatch service. SOS, dispatch and live streaming are not operational. No fabricated incidents, agency contact details or government affiliation claims are seeded. Agency directory entries are source-linked to official agency-owned pages and scheduled for review. Reports are not public until moderator review and source verification. Never publish reporter identity, phone number, home address or precise live location. Ingestion must use approved public feeds/APIs and respect terms, robots directives, rate limits, copyright and privacy. No access-control, login, paywall or CAPTCHA bypass. Media requires rights clearance, malware scanning, metadata stripping and moderation.

Before public launch: Nigerian privacy/legal review including NDPA 2023, DPIA where appropriate, retention and breach processes, moderation staffing, verified escalation contacts, security testing, and app-store disclosures. This repository is not a launch-ready emergency-response system.
