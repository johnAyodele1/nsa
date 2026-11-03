# Moderator account provisioning

Moderator access is assigned to an authenticated OIDC identity, not to an email address or GitHub username.

## Requirements

- Apply all database migrations first.
- Obtain the exact `sub` claim from the identity provider for the account that will sign in to NSA.
- Run this operation using the dedicated migration database connection (or another authorized database-owner connection). Do not use the API runtime connection.
- Keep the OIDC access token and ID token private. Never paste either token into a terminal transcript, issue, pull request, or chat.

## Provision a moderator

From the repository root, run:

```sh
psql "$MIGRATOR_DATABASE_URL" \
  -v auth_subject='EXACT_OIDC_SUB_CLAIM' \
  -f database/operations/provision_moderator.sql
```

The operation is safe to re-run for an active account: it promotes that exact identity to `moderator`. It creates the local `app_users` row if the identity has not signed in before. It refuses to reactivate an inactive account.

After provisioning, have that identity sign in again and open `/moderation`. The API resolves the verified JWT `sub` and checks the corresponding active `app_users` row on every moderator request.

## Verify

The SQL script prints the provisioned account ID, role and active status. Expected role: `moderator`.

Do not add a public API endpoint for role assignment. Do not grant the `nsa_app` runtime role permission to update `app_users.role`.
