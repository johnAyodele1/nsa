BEGIN;
DROP TRIGGER IF EXISTS app_users_assign_invited_moderator ON app_users;
DROP TRIGGER IF EXISTS app_users_consume_moderator_invite ON app_users;
DROP FUNCTION IF EXISTS assign_invited_moderator_role();
DROP FUNCTION IF EXISTS consume_moderator_invite_after_registration();
CREATE OR REPLACE FUNCTION manage_moderator(p_session_hash char(64),p_email varchar,p_action varchar,p_invite_token_hash char(64)) RETURNS TABLE(email varchar,action varchar,invite_created boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $auth$
DECLARE v_email varchar(254):=lower(btrim(p_email)); v_target_id uuid; v_actor_id uuid; v_target_role app_role; v_target_active boolean; v_invite_created boolean:=false;
BEGIN
 SELECT u.id INTO v_actor_id FROM public.auth_sessions s JOIN public.app_users u ON u.id=s.user_id WHERE s.session_id_hash=p_session_hash AND s.expires_at>now() AND u.role='admin' AND u.is_active IS TRUE;
 IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Active administrator session required' USING ERRCODE='42501'; END IF;
 IF v_email IS NULL OR length(v_email)>254 OR position('@' in v_email)<2 OR position('.' in split_part(v_email,'@',2))<2 THEN RAISE EXCEPTION 'Valid email address required' USING ERRCODE='22023'; END IF;
 SELECT id,role,is_active INTO v_target_id,v_target_role,v_target_active FROM public.app_users WHERE lower(app_users.email)=v_email;
 IF v_target_id IS NOT NULL AND v_target_active IS NOT TRUE THEN RAISE EXCEPTION 'Disabled accounts cannot be invited' USING ERRCODE='42501'; END IF;
 IF p_action='invite' THEN
  IF v_target_role='admin' THEN RAISE EXCEPTION 'Super-admin accounts cannot be changed to moderators' USING ERRCODE='42501'; END IF;
  IF v_target_role IS DISTINCT FROM 'moderator' THEN
   IF p_invite_token_hash IS NULL OR p_invite_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'A valid invitation token hash is required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.moderator_invites(email,created_by,invite_token_hash) VALUES(v_email,v_actor_id,p_invite_token_hash) ON CONFLICT ON CONSTRAINT moderator_invites_pkey DO UPDATE SET created_by=EXCLUDED.created_by,invite_token_hash=EXCLUDED.invite_token_hash,created_at=now();
   v_invite_created:=true;
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
CREATE OR REPLACE FUNCTION claim_moderator_invite(p_email varchar,p_invite_token_hash char(64),p_password_hash varchar,p_auth_subject varchar)
RETURNS TABLE(id uuid,auth_subject varchar,email varchar,role app_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $auth$
DECLARE v_email varchar(254):=lower(btrim(p_email)); v_actor_id uuid; v_user_id uuid; v_auth_subject varchar(255); v_role app_role; v_active boolean;
BEGIN
 IF v_email IS NULL OR length(v_email)>254 OR position('@' in v_email)<2 OR position('.' in split_part(v_email,'@',2))<2 OR p_invite_token_hash IS NULL OR p_invite_token_hash !~ '^[a-f0-9]{64}$' OR p_password_hash IS NULL OR p_password_hash NOT LIKE 'scrypt$16384$8$1$%' OR p_auth_subject IS NULL OR p_auth_subject NOT LIKE 'local:%' OR length(p_auth_subject)>255 THEN RAISE EXCEPTION 'Invalid moderator invitation claim' USING ERRCODE='22023'; END IF;
 SELECT created_by INTO v_actor_id FROM public.moderator_invites WHERE moderator_invites.email=v_email AND invite_token_hash=p_invite_token_hash AND created_at>now()-interval '7 days' FOR UPDATE;
 IF v_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.app_users WHERE public.app_users.id=v_actor_id AND public.app_users.role='admin' AND public.app_users.is_active IS TRUE) THEN RAISE EXCEPTION 'Moderator invitation is invalid or expired' USING ERRCODE='42501'; END IF;
 SELECT app_users.id,app_users.auth_subject,app_users.role,app_users.is_active INTO v_user_id,v_auth_subject,v_role,v_active FROM public.app_users WHERE lower(app_users.email)=v_email FOR UPDATE;
 IF v_user_id IS NOT NULL THEN
  IF v_active IS NOT TRUE OR v_role='admin' THEN RAISE EXCEPTION 'This account cannot claim moderator access' USING ERRCODE='42501'; END IF;
  UPDATE public.app_users SET password_hash=p_password_hash,role='moderator',updated_at=now() WHERE public.app_users.id=v_user_id;
  DELETE FROM public.auth_sessions WHERE auth_sessions.user_id=v_user_id;
  INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(v_user_id,v_actor_id,'moderator_invited');
 ELSE
  INSERT INTO public.app_users(auth_subject,email,password_hash,role) VALUES(p_auth_subject,v_email,p_password_hash,'moderator') RETURNING app_users.id,app_users.auth_subject,app_users.role INTO v_user_id,v_auth_subject,v_role;
  INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(v_user_id,v_actor_id,'moderator_invited');
 END IF;
 DELETE FROM public.moderator_invites WHERE moderator_invites.email=v_email AND invite_token_hash=p_invite_token_hash;
 RETURN QUERY SELECT v_user_id,v_auth_subject,v_email,'moderator'::app_role;
END;
$auth$;
REVOKE ALL ON FUNCTION claim_moderator_invite(varchar,char,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_moderator_invite(varchar,char,varchar,varchar) TO nsa_app;
COMMIT;