# Nigeria Security Alerts (NSA)

Nigeria-only public-safety information platform. Web and mobile share one API, PostgreSQL database, and Zod contracts.

## Workspace
- `apps/web`: responsive Next.js website.
- `apps/mobile`: Expo React Native app for Android and iOS.
- `apps/api`: Fastify + TypeScript API.
- `packages/contracts`: shared validation contracts.
- `database/migrations`: PostgreSQL schema.
- `apps/worker`: source-ingestion policy boundary; no auto-publishing.

## Local development
Requires Node.js 22.12+, pnpm 10+, Docker.

```sh
corepack enable
pnpm install
cp .env.example .env
docker compose up -d db
pnpm dev:api
```
Run `pnpm dev:web` and `pnpm dev:mobile` in separate terminals. For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP, not localhost.

## Safety and launch gates
NSA is independent, not a government agency or emergency dispatch service. No SOS, dispatch, or live-streaming is operational in this bootstrap. Never publish reporter identity, phone, home address, or precise live location. Reports remain pending until human review; one social post is not verification. Do not invent incidents, agency contacts, logos, or verification badges. Ingestion must use approved public feeds/APIs and respect terms, robots directives, rate limits, copyright, and privacy. No access-control, login, paywall, or CAPTCHA bypass. Media requires rights clearance, malware scanning, metadata stripping, and moderation.

Before public launch: Nigerian privacy/legal review including NDPA 2023, DPIA where appropriate, retention and breach processes, moderation staffing, verified escalation contacts, security testing, and app-store disclosures. This is an engineering foundation, not a launch-ready emergency-response system. No fake incidents are seeded.
