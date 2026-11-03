BEGIN;
DELETE FROM moderator_invites;
ALTER TABLE moderator_invites ADD COLUMN invite_token_hash char(64) NOT NULL CHECK(invite_token_hash ~ '^[a-f0-9]{64}$');
DROP FUNCTION manage_moderator(char,varchar,varchar);
CREATE OR REPLACE FUNCTION assign_invited_moderator_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $auth$
DECLARE v_token_hash text:=current_setting('nsa.moderator_invite_token_hash',true);
BEGIN
 IF NEW.email IS NOT NULL AND v_token_hash ~ '^[a-f0-9]{64}$' AND EXISTS(SELECT 1 FROM public.moderator_invites WHERE email=lower(NEW.email) AND invite_token_hash=v_token_hash) THEN NEW.role:='moderator'; END IF;
 RETURN NEW;
END;
$auth$;
REVOKE ALL ON FUNCTION assign_invited_moderator_role() FROM PUBLIC;
CREATE OR REPLACE FUNCTION consume_moderator_invite_after_registration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $auth$
DECLARE v_actor_id uuid; v_token_hash text:=current_setting('nsa.moderator_invite_token_hash',true);
BEGIN
 IF v_token_hash ~ '^[a-f0-9]{64}$' THEN
  SELECT created_by INTO v_actor_id FROM public.moderator_invites WHERE email=lower(NEW.email) AND invite_token_hash=v_token_hash FOR UPDATE;
  IF v_actor_id IS NOT NULL THEN
   INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(NEW.id,v_actor_id,'moderator_invited');
   DELETE FROM public.moderator_invites WHERE email=lower(NEW.email) AND invite_token_hash=v_token_hash;
  END IF;
 END IF;
 RETURN NEW;
END;
$auth$;
REVOKE ALL ON FUNCTION consume_moderator_invite_after_registration() FROM PUBLIC;
CREATE OR REPLACE FUNCTION manage_moderator(p_session_hash char(64),p_email varchar,p_action varchar,p_invite_token_hash char(64)) RETURNS TABLE(email varchar,action varchar,invite_created boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $auth$
DECLARE v_email varchar(254):=lower(btrim(p_email)); v_target_id uuid; v_actor_id uuid; v_target_role app_role; v_invite_created boolean:=false;
BEGIN
 SELECT u.id INTO v_actor_id FROM public.auth_sessions s JOIN public.app_users u ON u.id=s.user_id WHERE s.session_id_hash=p_session_hash AND s.expires_at>now() AND u.role='admin' AND u.is_active IS TRUE;
 IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Active administrator session required' USING ERRCODE='42501'; END IF;
 IF v_email IS NULL OR length(v_email)>254 OR position('@' in v_email)<2 OR position('.' in split_part(v_email,'@',2))<2 THEN RAISE EXCEPTION 'Valid email address required' USING ERRCODE='22023'; END IF;
 SELECT id,role INTO v_target_id,v_target_role FROM public.app_users WHERE lower(app_users.email)=v_email;
 IF p_action='invite' THEN
  IF v_target_role='admin' THEN RAISE EXCEPTION 'Super-admin accounts cannot be changed to moderators' USING ERRCODE='42501'; END IF;
  IF v_target_id IS NULL THEN
   IF p_invite_token_hash IS NULL OR p_invite_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'A valid invitation token hash is required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.moderator_invites(email,created_by,invite_token_hash) VALUES(v_email,v_actor_id,p_invite_token_hash) ON CONFLICT ON CONSTRAINT moderator_invites_pkey DO UPDATE SET created_by=EXCLUDED.created_by,invite_token_hash=EXCLUDED.invite_token_hash,created_at=now();
   v_invite_created:=true;
  ELSE
   UPDATE public.app_users SET role='moderator',updated_at=now() WHERE id=v_target_id AND role<>'moderator' AND is_active IS TRUE;
   DELETE FROM public.moderator_invites WHERE moderator_invites.email=v_email;
   INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(v_target_id,v_actor_id,'moderator_invited');
  END IF;
 ELSIF p_action='revoke' THEN
  DELETE FROM public.moderator_invites WHERE moderator_invites.email=v_email;
  IF v_target_id IS NOT NULL AND v_target_role='moderator' THEN
   UPDATE public.app_users SET role='member',updated_at=now() WHERE id=v_target_id;
   INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(v_target_id,v_actor_id,'moderator_revoked');
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported moderator action' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT v_email,p_action,v_invite_created;
END;
$auth$;
REVOKE ALL ON FUNCTION manage_moderator(char,varchar,varchar,char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION manage_moderator(char,varchar,varchar,char) TO nsa_app;
COMMIT;