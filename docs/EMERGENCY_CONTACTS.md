# Emergency contact directory and SOS behavior

## Seeded Nigerian emergency lines

The backend currently seeds only numbers supported by official government or regulator sources:

| Coverage | Agency / routing | Number | Source |
|---|---|---:|---|
| Nationwide | Nigeria Emergency Communications Centre; routes emergency calls to the relevant state response centre | **112** | [Nigerian Communications Commission](https://ncc.gov.ng/node/3132) |
| Lagos State | Lagos State Emergency Management Agency (LASEMA) | **767** | [Lagos State Government](https://www.lagosstate.gov.ng/connect) and [LASEMA contact page](https://lasema.com.ng/contact/) |

The NCC describes 112 as the nationwide emergency communications number used to route callers to the state emergency communications centre, whose operator contacts the relevant response agency (police, fire, ambulance, road safety and others). Lagos State publishes 112 and 767 as its toll-free LASEMA emergency lines.

Do not seed numbers copied only from aggregators, social posts, search snippets or third-party directories. The previous Lagos police and NSCDC direct-number entries were disabled because they could not be safely treated as verified emergency contacts. The LASEMA office number is not presented as an emergency dispatch number.

## Verification and maintenance

- Each row stores its jurisdiction, official source URL, verification timestamp and next review timestamp.
- The public API excludes inactive records and records whose `next_review_at` has passed.
- Re-check official source pages at least every 30 days. Confirm any change with the agency/regulator before changing the database.
- Add or change contacts through a new, reviewed SQL migration. Do not rewrite an already-applied migration.
- Keep the official source URL and review dates in the same change. Add integration coverage for the jurisdiction and expected fallback behavior.
- Never test a number by placing a test call to an emergency centre. Use an agency's published non-emergency contact channel to confirm routing details.

## SOS client behavior and limitations

- Location permission is requested only after the user taps **Get my location**.
- The app captures one foreground GPS fix, attempts a reverse-geocoded address, and displays coordinates plus a map link. If reverse geocoding fails, coordinates remain available.
- Coordinates stay in client memory. This SOS flow does not upload precise location to NSA or send it to 112/767.
- The call action opens the device phone dialler using a `tel:` URL. The user must confirm the call.
- The user must tell the operator their state, LGA, street/nearest landmark and coordinates. The app cannot make the emergency centre receive GPS automatically.
- The share action opens the operating system share sheet so the user can share their location separately with a chosen person. It is not an emergency dispatch integration.
- If location permission, GPS, network access or the contact API fails, the national 112 call action remains available. Do not delay an emergency call while troubleshooting GPS.

This is a user-assisted call aid, not an emergency dispatch service. It must not be marketed as a guaranteed responder, ambulance, police or rescue dispatch system. A staffed response operation, agency integration, escalation procedures, privacy impact assessment and physical-device safety testing are separate launch requirements.
