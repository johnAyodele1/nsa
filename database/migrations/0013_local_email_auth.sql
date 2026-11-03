BEGIN;
ALTER TABLE app_users ADD COLUMN email varchar(254), ADD COLUMN password_hash varchar(255);
CREATE UNIQUE INDEX app_users_email_unique_idx ON app_users (lower(email)) WHERE email IS NOT NULL;
CREATE TABLE auth_sessions (session_id_hash char(64) PRIMARY KEY CHECK(session_id_hash ~ '^[a-f0-9]{64}$'), user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE TABLE moderator_invites (email varchar(254) PRIMARY KEY CHECK(email=lower(btrim(email))), created_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE user_role_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT, actor_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT, action varchar(24) NOT NULL CHECK(action IN ('moderator_invited','moderator_revoked')), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX user_role_audit_target_idx ON user_role_audit(target_user_id,created_at DESC);
CREATE TRIGGER user_role_audit_append_only BEFORE UPDATE OR DELETE ON user_role_audit FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

CREATE OR REPLACE FUNCTION assign_invited_moderator_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $
BEGIN
 IF NEW.email IS NOT NULL AND EXISTS(SELECT 1 FROM public.moderator_invites WHERE email=lower(NEW.email)) THEN
  NEW.role:='moderator';
  DELETE FROM public.moderator_invites WHERE email=lower(NEW.email);
 END IF;
 RETURN NEW;
END;
$;
REVOKE ALL ON FUNCTION assign_invited_moderator_role() FROM PUBLIC;
CREATE TRIGGER app_users_assign_invited_moderator
 BEFORE INSERT ON app_users
 FOR EACH ROW EXECUTE FUNCTION assign_invited_moderator_role();
REVOKE INSERT ON app_users FROM nsa_app;
GRANT INSERT(auth_subject,email,password_hash) ON app_users TO nsa_app;

CREATE OR REPLACE FUNCTION manage_moderator(p_session_hash char(64),p_email varchar,p_action varchar) RETURNS TABLE(email varchar,action varchar) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $
DECLARE v_email varchar(254):=lower(btrim(p_email)); v_target_id uuid; v_actor_id uuid;
BEGIN
 SELECT u.id INTO v_actor_id FROM public.auth_sessions s JOIN public.app_users u ON u.id=s.user_id WHERE s.session_id_hash=p_session_hash AND s.expires_at>now() AND u.role='admin' AND u.is_active IS TRUE;
 IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Active administrator session required' USING ERRCODE='42501'; END IF;
 IF v_email IS NULL OR length(v_email)>254 OR position('@' in v_email)<2 OR position('.' in split_part(v_email,'@',2))<2 THEN RAISE EXCEPTION 'Valid email address required' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_target_id FROM public.app_users WHERE lower(app_users.email)=v_email;
 IF p_action='invite' THEN
  INSERT INTO public.moderator_invites(email,created_by) VALUES(v_email,v_actor_id) ON CONFLICT(email) DO UPDATE SET created_by=EXCLUDED.created_by,created_at=now();
  IF v_target_id IS NOT NULL THEN UPDATE public.app_users SET role='moderator',updated_at=now() WHERE id=v_target_id AND role<>'admin'; INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(v_target_id,v_actor_id,'moderator_invited'); END IF;
 ELSIF p_action='revoke' THEN
  DELETE FROM public.moderator_invites WHERE moderator_invites.email=v_email;
  IF v_target_id IS NOT NULL THEN UPDATE public.app_users SET role='member',updated_at=now() WHERE id=v_target_id AND role='moderator'; INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(v_target_id,v_actor_id,'moderator_revoked'); END IF;
 ELSE RAISE EXCEPTION 'Unsupported moderator action' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT v_email,p_action;
END; $$;
REVOKE ALL ON FUNCTION manage_moderator(char,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION manage_moderator(uuid,varchar,varchar) TO nsa_app;
GRANT SELECT,INSERT,DELETE ON auth_sessions TO nsa_app;
GRANT UPDATE(last_seen_at) ON auth_sessions TO nsa_app;
GRANT SELECT ON moderator_invites TO nsa_app;
GRANT SELECT,INSERT,UPDATE ON app_users TO nsa_migrator;
COMMIT;