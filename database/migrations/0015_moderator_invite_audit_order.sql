BEGIN;
DROP TRIGGER app_users_assign_invited_moderator ON app_users;
CREATE OR REPLACE FUNCTION assign_invited_moderator_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $auth$
BEGIN
 IF NEW.email IS NOT NULL AND EXISTS(SELECT 1 FROM public.moderator_invites WHERE email=lower(NEW.email)) THEN NEW.role:='moderator'; END IF;
 RETURN NEW;
END;
$auth$;
REVOKE ALL ON FUNCTION assign_invited_moderator_role() FROM PUBLIC;
CREATE TRIGGER app_users_assign_invited_moderator BEFORE INSERT ON app_users FOR EACH ROW EXECUTE FUNCTION assign_invited_moderator_role();
CREATE OR REPLACE FUNCTION consume_moderator_invite_after_registration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $auth$
DECLARE v_actor_id uuid;
BEGIN
 SELECT created_by INTO v_actor_id FROM public.moderator_invites WHERE email=lower(NEW.email) FOR UPDATE;
 IF v_actor_id IS NOT NULL THEN
  INSERT INTO public.user_role_audit(target_user_id,actor_user_id,action) VALUES(NEW.id,v_actor_id,'moderator_invited');
  DELETE FROM public.moderator_invites WHERE email=lower(NEW.email);
 END IF;
 RETURN NEW;
END;
$auth$;
REVOKE ALL ON FUNCTION consume_moderator_invite_after_registration() FROM PUBLIC;
CREATE TRIGGER app_users_consume_moderator_invite AFTER INSERT ON app_users FOR EACH ROW EXECUTE FUNCTION consume_moderator_invite_after_registration();
COMMIT;