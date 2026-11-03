\set ON_ERROR_STOP on

\if :{?auth_subject}
\else
  \echo 'ERROR: pass -v auth_subject=<exact OIDC sub>'
  \quit 2
\endif

SELECT set_config('nsa.provision_auth_subject', :'auth_subject', false);

BEGIN;

DO $provision_moderator$
DECLARE
  v_subject text := current_setting('nsa.provision_auth_subject', true);
  v_user_id uuid;
BEGIN
  IF v_subject IS NULL OR length(v_subject) < 1 OR length(v_subject) > 255 THEN
    RAISE EXCEPTION 'OIDC subject must contain 1 to 255 characters';
  END IF;

  INSERT INTO app_users (auth_subject, role)
  VALUES (v_subject, 'moderator')
  ON CONFLICT (auth_subject)
  DO UPDATE
    SET role = 'moderator',
        updated_at = now()
    WHERE app_users.is_active IS TRUE
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Matching account is inactive; refusing to reactivate it';
  END IF;

  RAISE NOTICE 'Moderator provisioned for app_users.id=%', v_user_id;
END
$provision_moderator$;

COMMIT;

SELECT id, role, is_active, created_at, last_seen_at
FROM app_users
WHERE auth_subject = current_setting('nsa.provision_auth_subject', true);
