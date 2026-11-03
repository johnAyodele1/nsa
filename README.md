# Nigeria Security Alerts (NSA)

Nigeria-focused public-safety information platform. Web, Android and iOS clients share one Express API, PostgreSQL database and Zod contracts.

## Workspace
- `apps/web`: responsive Next.js incident feed, official agency directory, OIDC-backed report form (`/report`) and moderator console (`/moderation`) and Agora live-video interface (`/live`).
- `apps/mobile`: Expo React Native incident feed, official agency directory and OIDC-authenticated report submission and Agora native live-video interface for Android and iOS.
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
Before the first migration, provision separate login roles with a database administrator. Create the NOLOGIN group roles `nsa_app`, `nsa_worker`, `nsa_web`, and `nsa_migrator`; create distinct LOGIN users for the API, worker, web session store and migration runner; grant each login membership in only its matching group role. Grant the migration login `USAGE, CREATE` on schema `public`. The SQL migrations also create the group roles if they do not already exist. Keep each connection string in the deployment secret manager. The migration runner must connect as the dedicated migration login, not as the API login or a superuser. `DATABASE_URL` is reserved for local/CI PostgreSQL integration tests.

Provision these roles once as the database administrator, before running migrations. Use separate strong passwords; set them with psql's interactive \password command and store them in your secret manager.

```sql
CREATE ROLE nsa_app NOLOGIN;
CREATE ROLE nsa_worker NOLOGIN;
CREATE ROLE nsa_web NOLOGIN;
CREATE ROLE nsa_migrator NOLOGIN;
CREATE ROLE nsa_api_login LOGIN;
CREATE ROLE nsa_worker_login LOGIN;
CREATE ROLE nsa_web_login LOGIN;
CREATE ROLE nsa_migrator_login LOGIN;
GRANT nsa_app TO nsa_api_login;
GRANT nsa_worker TO nsa_worker_login;
GRANT nsa_web TO nsa_web_login;
GRANT nsa_migrator TO nsa_migrator_login;
GRANT USAGE, CREATE ON SCHEMA public TO nsa_migrator;
```

For the web BFF, set `WEB_PUBLIC_ORIGIN`, `API_INTERNAL_URL`, and generate `WEB_SESSION_ENCRYPTION_KEY` with `openssl rand -base64 32`. The browser only receives an HttpOnly opaque session cookie and a CSRF cookie; it never receives the provider access token. Configure the OIDC client callback URI as `https://your-web-host/api/auth/callback` and register the matching logout/allowed-origin settings at the identity provider.

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
- `GET /v1/live-sessions`: approved live sessions only.
- `GET /v1/live-sessions/mine`: authenticated broadcaster's own session requests.
- `POST /v1/live-sessions`: submit a broadcast request with all safety acknowledgements.
- `GET /v1/live-sessions/moderation/queue` and `/moderation/live`: moderator-only pending and active broadcasts.
- `GET /v1/moderation/sources`: moderator/admin-only approved evidence sources.
- `POST /v1/moderation/reports/:reportId/decision`: moderator/admin-only approve/reject. Approval requires reviewed source-registry entries. Corroborated reports need at least two distinct publishers; official confirmation needs an official source entry.

The web report form is available at `/report`; the native report form is available at `/report`; the moderator console is at `/moderation`. The web client uses a Next.js BFF with authorization-code + PKCE, state/nonce verification, encrypted server-side access-token storage, opaque HttpOnly session cookies and CSRF validation. Browser JavaScript never receives the OIDC access token. Native access tokens are stored with iOS Keychain / Android Keystore via SecureStore. Source registry records must be provisioned by an authorized operator. RSS/Atom/JSON Feed adapters stage items for human moderation; no automatic publication is enabled, and the feed remains empty until approved sources exist and the worker is running.

## Verified engineering baseline
- Express 5 with injectable app, Helmet, explicit CORS allowlist, bounded JSON bodies and API rate limiting.
- Server-generated `x-request-id` correlation headers and structured JSON request/error logs; request logs omit query strings, IP addresses and user identifiers.
- PostgreSQL pool with connection and statement timeouts.
- Advisory-locked, transactional, idempotent SQL migration runner.
- Database constraints enforce Nigerian states, reviewed source approval and safe publication prerequisites.
- Authenticated report intake, per-account rate limiting, private report status, role-protected moderation and audit records.
- OIDC verification uses HTTPS JWKS and explicit issuer/audience/algorithm checks.
- CI runs TypeScript checks, unit tests, PostgreSQL integration tests against an empty PostgreSQL 17 service, and workspace builds.

## Agora live-video backend

The Express API has server-side Agora RTC token generation and a moderated live-session lifecycle:
- Authenticated broadcaster requests require explicit safety acknowledgements and enter a moderator queue.
- Only approved broadcasters can start a session; sessions expire automatically from the public listing.
- Short-lived publisher tokens are issued only to the session owner. Audience tokens are withheld by default. An operator must deliberately set `AGORA_AUDIENCE_TOKEN_ENABLED=true` after validating Agora App Certificate token authentication and the moderation operation.
- Viewers can report abuse; moderators can inspect and resolve those reports. The App Certificate remains server-side.

The web client uses `agora-rtc-sdk-ng`; Android/iOS use `react-native-agora`. Both request media only when a user explicitly starts an approved broadcast and renew short-lived RTC tokens. The native SDK still requires physical-device development builds. Agora credentials, viewer-token enablement, moderation staffing, bandwidth testing, retention operations and production smoke tests remain launch gates. SOS and responder dispatch are not implemented.

## Privacy API

Authenticated users can submit privacy-rights requests and request local account erasure. Erasure disables local access, writes a tombstone to prevent account recreation and ends/cancels the user's active or pending broadcasts. Identity-provider account deletion remains a manual provider-side operation; a successful local request is not represented as full external deletion.

## Safety and launch gates
NSA is independent, not a government agency or emergency dispatch service. SOS and responder dispatch are not implemented. Agora RTC server endpoints issue short-lived tokens only for approved, active streams; live video remains unavailable until Agora credentials, audience-token enablement, moderation staffing, retention policy, bandwidth limits and device testing are in place. No fabricated incidents, agency contact details or government affiliation claims are seeded. Agency directory entries are source-linked to official agency-owned pages and scheduled for review. Reports are not public until moderator review and source verification. Never publish reporter identity, phone number, home address or precise live location. Ingestion must use approved public feeds/APIs and respect terms, robots directives, rate limits, copyright and privacy. No access-control, login, paywall or CAPTCHA bypass. Media requires rights clearance, malware scanning, metadata stripping and moderation.

Before public launch: Nigerian privacy/legal review including NDPA 2023, DPIA where appropriate, retention and breach processes, moderation staffing, verified escalation contacts, security testing, and app-store disclosures. This repository is not a launch-ready emergency-response system.


## Nigerian news ingestion sources

Migrations `0008_seed_nigerian_news_sources.sql`, `0009_expand_nigerian_news_and_alert_sources.sql` and `0010_add_regional_nigerian_news_sources.sql` register 28 RSS/CAP feed candidates across Nigerian publishers and public weather alerts.

Initial Nigerian publisher candidates:
- Channels Television — `https://www.channelstv.com/feed/`
- Premium Times — `https://www.premiumtimesng.com/feed`
- The Punch — `https://rss.punchng.com/v1/category/latest_news`
- Vanguard — `https://www.vanguardngr.com/feed/`

Additional publisher and regional coverage candidates:
- BBC News Africa — `https://feeds.bbci.co.uk/news/world/africa/rss.xml` (regional Africa coverage, not Nigeria-only)
- Daily Trust — `https://dailytrust.com/feed/`
- Daily Post Nigeria — `https://dailypost.ng/feed`
- The Guardian Nigeria — `https://guardian.ng/feed/`
- TheCable — `https://www.thecable.ng/feed`
- The Nation — `https://thenationonlineng.net/feed/`
- Legit.ng — `https://www.legit.ng/rss/all.rss`
- Information Nigeria — `https://www.informationng.com/feed`
- Tribune Online — `https://tribuneonlineng.com/feed/`
- Sahara Reporters — `https://saharareporters.com/feeds/latest/feed`
- P.M. News — `https://pmnewsnigeria.com/feed/`
- BusinessDay — `https://businessday.ng/feed/`
- Arise News — `https://www.arise.tv/feed/`
- TVC News — `https://www.tvcnews.tv/feed/`
- Ripples Nigeria — `https://www.ripplesnigeria.com/feed/`
- ThisDay — `https://www.thisdaylive.com/feed`
- Leadership — `https://leadership.ng/feed/`
- Nigerian Bulletin — `https://www.nigerianbulletin.com/forums/-/index.rss`
- NigerianEye — `https://www.nigerianeye.com/feeds/posts/default`
- The Tide (Rivers State) — `https://www.thetidenewsonline.com/feed/`
- Daily News Reporters (Southeast Nigeria) — `https://dailynewsreporters.com/feed/`
- Converseer — `https://converseer.com/feed/`

Official weather alert candidates:
- NiMet English CAP/RSS — `https://cap-sources.s3.amazonaws.com/ng-nimet-en/rss.xml`
- NiMet Hausa CAP/RSS — `https://cap-sources.s3.amazonaws.com/ng-nimet-ha/rss.xml`

The NiMet CAP endpoints are listed in the World Meteorological Organization's Register of Alerting Authorities for Nigeria. BBC Africa and the publisher feed candidates are drawn from publisher feed listings and independent feed directories; those directories are discovery evidence, not a substitute for publisher permission or a terms review.

**All entries are inserted as `approval_status='pending'`.** This is deliberate. Registering a URL does not mean the worker is collecting from it. Before approval, an authorized operator must verify the endpoint's current response and parser compatibility, publisher terms, robots policy, attribution, retention and rate limits. The worker only claims approved sources whose robots and terms checks are recorded.

Nigeria Police Force, Defence Headquarters, NEMA and state emergency-management agencies still need individually verified feed/API endpoints or dedicated, terms-compliant website adapters. Do not put ordinary HTML page URLs into the RSS/Atom/JSON Feed adapter. Social network monitoring requires separate platform-specific integrations and applicable API permissions. The RSS seed does not implement those integrations or automatically publish source items.
