BEGIN;
CREATE OR REPLACE FUNCTION clear_erased_local_credentials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,public
AS $$
BEGIN
 IF NEW.auth_subject LIKE 'erased:%' THEN
  NEW.email:=NULL;
  NEW.password_hash:=NULL;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION clear_erased_local_credentials() FROM PUBLIC;
CREATE TRIGGER app_users_clear_erased_credentials
 BEFORE UPDATE OF auth_subject ON app_users
 FOR EACH ROW EXECUTE FUNCTION clear_erased_local_credentials();

CREATE OR REPLACE FUNCTION revoke_deactivated_auth_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
BEGIN
 IF (OLD.is_active IS TRUE AND NEW.is_active IS FALSE) OR OLD.auth_subject IS DISTINCT FROM NEW.auth_subject THEN
  DELETE FROM public.auth_sessions WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION revoke_deactivated_auth_sessions() FROM PUBLIC;
CREATE TRIGGER app_users_revoke_auth_sessions
 AFTER UPDATE OF is_active,auth_subject ON app_users
 FOR EACH ROW EXECUTE FUNCTION revoke_deactivated_auth_sessions();
COMMIT;
