BEGIN;
CREATE TABLE privacy_request_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 privacy_request_id uuid NOT NULL REFERENCES privacy_requests(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 action varchar(16) NOT NULL CHECK(action IN ('submitted','completed','declined')),
 reason varchar(1000) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX privacy_request_audit_request_idx ON privacy_request_audit(privacy_request_id,created_at DESC);
CREATE TRIGGER privacy_request_audit_append_only BEFORE UPDATE OR DELETE ON privacy_request_audit FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TABLE erased_auth_subjects(
 subject_hash char(64) PRIMARY KEY CHECK(subject_hash ~ '^[a-f0-9]{64}$'),
 privacy_request_id uuid NOT NULL REFERENCES privacy_requests(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER erased_auth_subjects_append_only BEFORE UPDATE OR DELETE ON erased_auth_subjects FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE OR REPLACE FUNCTION request_account_erasure(p_auth_subject varchar(255),p_subject_hash char(64)) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user_id uuid;v_request_id uuid;v_row record;
BEGIN
 IF p_auth_subject IS NULL OR length(p_auth_subject)=0 OR p_subject_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid account erasure request' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_user_id FROM app_users WHERE auth_subject=p_auth_subject AND is_active IS TRUE FOR UPDATE;
 IF v_user_id IS NULL THEN RETURN NULL; END IF;
 INSERT INTO privacy_requests(user_id,request_type,status,details) VALUES(v_user_id,'erasure','in_review','Local access disabled. Identity-provider deletion and final legal review remain pending.') RETURNING id INTO v_request_id;
 INSERT INTO erased_auth_subjects(subject_hash,privacy_request_id) VALUES(p_subject_hash,v_request_id);
 INSERT INTO privacy_request_audit(privacy_request_id,actor_id,action,reason) VALUES(v_request_id,v_user_id,'submitted','Account erasure requested by authenticated account holder.');
 FOR v_row IN SELECT id FROM incident_reports WHERE reporter_id=v_user_id AND status='pending_review' FOR UPDATE LOOP
  UPDATE incident_reports SET title='Reporter withdrew report',summary='Report withdrawn during account erasure.',locality=NULL,source_url=NULL,status='rejected',reviewed_by=v_user_id,reviewed_at=now(),updated_at=now() WHERE id=v_row.id;
  INSERT INTO report_moderation_audit(report_id,actor_id,action,reason) VALUES(v_row.id,v_user_id,'reject','Reporter withdrew report during account erasure.');
 END LOOP;
 FOR v_row IN UPDATE live_stream_sessions SET status='ended',ended_at=now(),updated_at=now() WHERE owner_id=v_user_id AND status='live' RETURNING id LOOP
  INSERT INTO live_stream_audit(live_stream_id,actor_id,action,reason) VALUES(v_row.id,v_user_id,'end','Live session ended due to account erasure request.');
 END LOOP;
 FOR v_row IN UPDATE live_stream_sessions SET status='rejected',updated_at=now() WHERE owner_id=v_user_id AND status IN ('pending_review','approved') RETURNING id LOOP
  INSERT INTO live_stream_audit(live_stream_id,actor_id,action,reason) VALUES(v_row.id,v_user_id,'reject','Pending broadcast cancelled due to account erasure request.');
 END LOOP;
 DELETE FROM web_sessions WHERE auth_subject=p_auth_subject;
 UPDATE app_users SET is_active=false,auth_subject='erased:'||v_user_id::text,role='member',updated_at=now() WHERE id=v_user_id;
 RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION request_account_erasure(varchar,char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_account_erasure(varchar,char) TO nsa_app;
GRANT SELECT ON erased_auth_subjects TO nsa_app;
GRANT SELECT,INSERT ON privacy_request_audit TO nsa_app;
COMMIT;
