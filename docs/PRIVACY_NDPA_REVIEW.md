# Privacy and NDPA review preparation

**Status: engineering preparation only — not a legal opinion, DPIA approval or NDPA compliance certification.**

This document is a review pack for Nigerian privacy counsel and the organisation's designated Data Protection Officer (DPO). Do not publish it as a privacy policy. Do not claim compliance until the actual data flows, vendors, contracts and operational controls have been reviewed and signed off.

## 1. Decisions required before launch

The product owner and qualified privacy counsel/DPO must record and approve:

- The legal entity operating NSA and whether it acts as data controller, joint controller or processor for each activity.
- The purposes and lawful basis for each processing activity; consent must not be used as a blanket substitute for another appropriate lawful basis.
- Whether a Data Protection Impact Assessment (DPIA) is required, and its scope, findings, mitigations and approval.
- Whether a Data Protection Compliance Organisation (DPCO), registration, audit or other filing obligation applies to the actual operator and processing scale.
- Data-subject rights handling, identity verification, response deadlines, appeal/escalation and exemptions.
- Retention periods and deletion procedures for every database, log, backup, analytics system, media provider and identity provider.
- International transfers, hosting locations, subprocessors, cross-border safeguards and vendor agreements.
- Children's data, vulnerable people, emergency reports, allegations of crime and other high-risk data handling.
- Security incident classification, regulator/data-subject notification decisions, evidence preservation and breach-response ownership.
- Public privacy notice, mobile permission disclosures, cookie/session notice, terms, complaints channel and DPO contact.

## 2. Current technical data-flow inventory

This is a code-oriented inventory, not proof that production configuration matches it. Confirm every item against the deployed infrastructure and vendor consoles.

| Data | Current purpose / handling | Outstanding review |
|---|---|---|
| OIDC subject and member account ID | Authentication and account ownership; local account access can be disabled by the erasure workflow | Identity provider retention/deletion, account-linking and lawful basis |
| Web session and encrypted OIDC tokens | Maintain authenticated web sessions; server-side storage and HttpOnly cookie model | Encryption-key lifecycle, database backups, session revocation, hosting region |
| Community incident reports | Private submission, moderation and publication after review | Reporter notice, minimisation, retention, correction/objection and legal holds |
| Public-source feed content and URLs | Ingestion staging, deduplication, source verification and public reporting | Publisher terms/licence, source retention, copyright and removal requests |
| Privacy-rights requests | Intake, status and append-only audit trail | Identity verification, retention, response SLAs and restricted access |
| SOS GPS coordinates | Captured in foreground after explicit user action; displayed locally and available for manual sharing; not sent to NSA by the current SOS flow | Confirm device backups/OS sharing behavior, permission disclosure and future dispatch DPIA |
| SOS call selection | Opens the device phone dialler through a tel link; user confirms the call | Confirm supported platform behavior and no claim that GPS is transmitted |
| Live video / RTC metadata | Agora RTC token and stream workflow exists in code | Provider configuration, recording status, metadata, retention, moderation and international transfer review |

## 3. Proposed data minimisation and retention register

No universal retention duration should be invented. The DPO/counsel and product owner must approve a duration and deletion mechanism for each category before launch.

| Data category | Current known behavior | Required policy decision |
|---|---|---|
| Foreground SOS coordinates | In-memory client state only; not persisted by NSA | Keep ephemeral by default. If dispatch is later added, define consent, purpose, access, expiry, deletion and audit before implementation |
| Account and authentication records | Local account disablement and hashed erased-subject tombstone; external identity-provider deletion is manual | Define account closure, token/session revocation, tombstone and backup lifecycle |
| Incident reports and moderation audit | Stored in PostgreSQL; audit records are append-only | Set retention by report status, safety/legal need, user rights and legal holds; define redaction/anonymisation |
| Ingestion staging | Source registry includes a per-source retention_days value | Verify cleanup job exists, define deletion of raw content and derived copies, test expiry |
| Privacy requests and audit | Stored in PostgreSQL; audit is append-only | Define request and audit retention and who may read details |
| Application/security logs | Structured request logs are implemented | Set log retention, access, redaction and deletion; ensure no coordinates, tokens, report text or query strings are logged |
| Live video/provider metadata | Provider-backed workflow exists | Decide whether recording is disabled, provider metadata retention, stream deletion and abuse-evidence holds |

For every approved duration, document: owner, legal/operational rationale, storage locations, deletion job or manual process, backup expiry, verification query/evidence, failure alert and exception/hold procedure.

## 4. Security and privacy controls to verify in production

- TLS on every public and service-to-service connection.
- Production secrets held in a secret manager; no secrets in source, client bundles or logs.
- Encryption at rest for databases, backups, object storage and OAuth tokens; key rotation and recovery procedure.
- Least-privilege production roles, MFA for privileged operators, periodic access review and prompt offboarding.
- No precise SOS coordinates, authentication tokens, report bodies or personal data in analytics or application logs.
- Rate limits, abuse detection, vulnerability management, backups and tested restoration.
- Data-subject request workflow with identity verification, ownership checks, response tracking and auditable decisions.
- Account deletion tested end-to-end across application DB, identity provider, object storage, vendors, caches and backups.
- Vendor/subprocessor inventory, DPAs, international transfer assessment and incident notification clauses.
- Breach-response playbook with named on-call owners, severity criteria, evidence handling and regulator/data-subject notification decision process.

## 5. Required evidence and sign-off

Attach or link the following before release:

- Approved privacy notice, terms and mobile permission copy.
- Signed DPIA where required, including residual-risk acceptance.
- Signed data-processing agreements and subprocessor list.
- Approved retention schedule and evidence of deletion/expiry tests.
- Security assessment and remediation record.
- Account deletion and data-subject rights test evidence.
- Breach tabletop exercise and contact/escalation roster.
- Named DPO/privacy contact and support process.
- Written legal sign-off for the actual production deployment and processing purposes.

## 6. Sign-off record

Leave these fields blank until the responsible people have actually reviewed the deployed system.

- Product owner: **Pending**
- Data Protection Officer: **Pending**
- Qualified Nigerian privacy counsel: **Pending**
- DPIA decision / approval reference: **Pending**
- Approval date and version: **Pending**
- Residual risks accepted by: **Pending**

No checkbox in the engineering checklist should be changed to complete based only on this preparation document.
