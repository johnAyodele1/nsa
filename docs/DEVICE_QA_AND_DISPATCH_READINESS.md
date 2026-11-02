# Device QA and responder-dispatch launch readiness

**Status: procedures prepared; no physical-device sign-off and no responder-dispatch service exists.**

## 1. Physical SOS test matrix

Run these tests on a real Android device and a real iPhone using release-like builds and production-equivalent configuration. A simulator/emulator or Expo export is not sufficient evidence for native permission, phone and location behavior.

Record for every test: device model, OS version, app build/commit, network/carrier, location setting, permission state, test date, tester, observed result, evidence reference and defect ID.

| ID | Platform | Setup / action | Expected result |
|---|---|---|---|
| DEV-01 | Android + iOS | Fresh install; open SOS without tapping location | No location permission prompt appears |
| DEV-02 | Android + iOS | Tap Get my location; grant while-in-use permission | A foreground location fix is requested and displayed |
| DEV-03 | Android + iOS | Deny permission | Clear explanation; 112 call action remains usable |
| DEV-04 | Android + iOS | Deny permission permanently / don't ask again | App explains how to enable permission in system settings; no prompt loop |
| DEV-05 | Android + iOS | Disable device location services | Graceful error; no crash; 112 remains usable |
| DEV-06 | Android + iOS | Indoor/poor GPS signal and slow network | Loading/error state is clear; do not show stale coordinates as current |
| DEV-07 | Android + iOS | Reverse geocoding fails or returns no address | Coordinates and map link remain available |
| DEV-08 | Android + iOS | Test location in Lagos and a non-Lagos state | Correct regional contact is displayed alongside nationwide 112 |
| DEV-09 | Android + iOS | Tap 112 call action | OS opens phone dialler with 112; app does not claim a call was completed |
| DEV-10 | Android + iOS | Tap Lagos 767 while in Lagos | OS opens phone dialler with 767 |
| DEV-11 | Android + iOS | Device has no dialler / URL handler rejects tel link | Action fails safely with manual-dial fallback |
| DEV-12 | Android + iOS | Share location | OS share sheet opens with address/coordinates/map URL; user chooses recipient |
| DEV-13 | Android + iOS | Close app after capture, then inspect app/API/network logs | NSA has not persisted or transmitted precise coordinates |
| DEV-14 | Android + iOS | Contacts API unavailable or returns invalid data | 112 fallback remains visible and usable |
| DEV-15 | Android + iOS | Test screen reader, large text, contrast and one-handed reach | Critical call action is accessible and cannot be obscured |

**Safety rule:** Never place a test call to 112, 767 or another live emergency number. Validate tel URL handling without completing the call, using a test dialler/controlled test harness or an approved non-emergency test number supplied by the platform/agency.

## 2. Test evidence record

Create one record per physical device and attach screenshots/video where safe. Do not include real people's location or personal data in evidence.

- Android device/model and OS: **Not run**
- Android build/commit: **Not run**
- Android tester/date: **Not run**
- Android results and defects: **Not run**
- iPhone model and iOS version: **Not run**
- iOS build/commit: **Not run**
- iOS tester/date: **Not run**
- iOS results and defects: **Not run**
- QA owner sign-off: **Pending**

## 3. Responder dispatch is a separate service

The current SOS client is a user-assisted call and location-sharing aid. It does not notify NSA operators, emergency agencies, trusted contacts or responders. It must not be described as automatic dispatch.

Do not implement a production dispatch provider or transmit a person's precise location until all of the following exist:

1. **Named partner and authority:** Written agreement with each participating emergency-response organisation; permission to use its name, contact details and integration.
2. **Operational coverage:** Named dispatch operator, staffed hours, backup/on-call rota, geographic coverage, languages, training and supervision. If 24/7 coverage is advertised, it must actually be staffed 24/7.
3. **Documented response contract:** Partner API/protocol, authentication, service levels, accepted incident categories, acknowledgment semantics, escalation path and outage procedure.
4. **Consent and privacy design:** Explicit user action to share precise location and emergency details with named recipients; clear purpose and recipient; minimum necessary data; expiry; revocation where technically possible; privacy notice and DPIA approval.
5. **Safety model:** False-alarm handling, accidental activation/cancellation, duplicate SOS, silent failure, no-network behavior, spoofed/malicious reports, vulnerable users, safeguarding and safe callback procedure.
6. **Technical controls:** Authenticated server-to-server adapter, TLS, signed webhooks, idempotency, replay protection, bounded retries, dead-letter queue, operator acknowledgment, delivery status and tamper-evident access audit.
7. **Location controls:** Timestamp, accuracy radius, source, stale-location warning, permission state, update frequency and automatic expiry. Never silently track in the background.
8. **Security controls:** Least-privilege responder accounts, MFA, access logging, encryption, incident response, penetration test and vendor data-processing terms.
9. **Operational exercises:** End-to-end drills with the partner, including API outage, no acknowledgment, wrong location, duplicate event, user cancellation and handover to the national 112 service.
10. **Go-live approval:** Product owner, partner agency, operations lead, security lead and DPO/privacy counsel sign-off.

### Required dispatch state machine

A future implementation should use explicit states such as:

created -> consented -> submitted -> acknowledged -> assigned -> resolved

with separate terminal or exception states for cancelled, expired, rejected, delivery_failed and unacknowledged_escalated.

A successful HTTP request is not proof that a human responder received or accepted the incident. The UI must show the actual partner acknowledgment state and retain the manual 112/767 fallback.

## 4. Current launch decision

- User-assisted SOS call aid: **Code exists; physical-device QA pending.**
- Automated responder dispatch: **Not implemented; no agency integration or staffed response operation.**
- NDPA/privacy approval: **Not complete; see docs/PRIVACY_NDPA_REVIEW.md.**
- Emergency-service guarantee: **Not available.**
