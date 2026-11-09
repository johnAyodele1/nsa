import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import type {RequestHandler} from "express";
import pg from "pg";
import request from "supertest";
import {createApp} from "../src/app.js";
import {createLocalAuthMiddleware} from "../src/local-auth.js";
import {applyMigrations} from "../src/migrate.js";
const {Pool}=pg;
const databaseUrl=process.env.DATABASE_URL;
const reportAuth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"integration|member"};next();};
describe.skipIf(!databaseUrl)("PostgreSQL incident, report and moderation integration",()=>{
 const pool=new Pool({connectionString:databaseUrl});
 const app=createApp({pool,allowedOrigins:[]});
 const authenticatedApp=createApp({pool,allowedOrigins:[],authMiddleware:reportAuth});
 const localAuthApp=createApp({pool,allowedOrigins:[],authMiddleware:createLocalAuthMiddleware(pool)});
 const moderationApp=localAuthApp;
 const moderatorToken="M".repeat(43);
 let sourceRegistryId="";let reportId="";
 beforeAll(async()=>{
  await Promise.all([applyMigrations(pool),applyMigrations(pool)]);await applyMigrations(pool);
  await pool.query("TRUNCATE report_moderation_audit,incident_reports,app_users,moderation_audit,incident_sources,incidents,source_registry RESTART IDENTITY CASCADE");
  const moderatorId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await pool.query("INSERT INTO app_users(id,auth_subject,role) VALUES($1,$2,'moderator')",[moderatorId,"integration|moderator"]);
  await pool.query("INSERT INTO auth_sessions(session_id_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(moderatorToken).digest("hex"),moderatorId]);
  const source=await pool.query("INSERT INTO source_registry(publisher_name,display_name,canonical_url,feed_url,source_kind,terms_url,licence_name,attribution_text,is_official,robots_checked_at,robots_allowed,terms_reviewed_at,approval_status,approved_by,approved_at) VALUES($1,$2,$3,$4,'api',$5,$6,$7,true,now(),true,now(),'approved',$8,now()) RETURNING id",["Lagos Emergency Management Agency","Lagos Emergency Management Agency","https://agency.gov.ng","https://agency.gov.ng/public-notices","https://agency.gov.ng/terms","Public notices","Source attribution required",moderatorId]);
  sourceRegistryId=source.rows[0].id;
  const insert=`INSERT INTO incidents(id,title,summary,category,state,locality,occurred_at,published_at,verification_status,status,source_count,public_source_url,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
  const rows=[
   ["3f4e4b18-22b5-4d14-bbcb-17c48edc05d2","Published first incident","This report has been reviewed and approved for public display by an authorized moderator.","road_accident","Lagos","Ikeja","2026-11-02T08:00:00Z","2026-11-02T08:30:00Z","corroborated","published",2,"https://example.gov.ng/first",moderatorId,"2026-11-02T08:40:00Z"],
   ["2f4e4b18-22b5-4d14-bbcb-17c48edc05d1","Published second incident","This second reviewed public safety report is available from its original primary source.","fire","Oyo","Ibadan","2026-11-02T07:00:00Z","2026-11-02T08:30:00Z","officially_confirmed","published",1,"https://example.gov.ng/second",moderatorId,"2026-11-02T08:40:00Z"],
   ["4f4e4b18-22b5-4d14-bbcb-17c48edc05d3","Pending unreviewed report","This report is still waiting for a moderator and must never appear in the public incident feed.","robbery","Lagos","Yaba","2026-11-02T09:00:00Z",null,"unverified","pending_review",0,null,null,null]
  ] as const;
  for(const row of rows)await pool.query(insert,[...row]);
 });
 afterAll(async()=>{await pool.end();});
 it("records every migration once and skips them on subsequent runs",async()=>{
  const result=await pool.query("SELECT version FROM schema_migrations ORDER BY version");
  expect(result.rows.map(row=>row.version)).toEqual(["0001_initial.sql","0002_auth_reports.sql","0003_agency_directory.sql","0004_ingestion_security.sql","0005_live_stream_security.sql","0006_privacy_erasure.sql","0007_emergency_contacts.sql","0008_seed_nigerian_news_sources.sql","0009_expand_nigerian_news_and_alert_sources.sql","0010_add_regional_nigerian_news_sources.sql","0011_add_incident_categories.sql","0012_incident_relevance_and_priority.sql","0013_local_email_auth.sql","0014_auth_session_cleanup.sql","0015_moderator_invite_audit_order.sql","0016_secure_moderator_invites.sql","0017_moderator_invite_claim.sql","0018_source_registry_moderation.sql"]);
 });

 it("registers, signs in, resolves and revokes local email/password sessions",async()=>{
  const email="auth-integration@example.test";const password="correct-horse-battery-staple-2026";
  const registered=await request(localAuthApp).post("/v1/auth/register").send({email,password}).expect(201);
  const firstToken=registered.body.data.accessToken as string;
  expect(registered.body.data.user).toMatchObject({email,role:"member"});
  const stored=await pool.query("SELECT password_hash FROM app_users WHERE email=$1",[email]);
  expect(stored.rows[0].password_hash.startsWith("scrypt$16384$8$1$")).toBe(true);
  expect(stored.rows[0].password_hash).not.toBe(password);
  await request(localAuthApp).get("/v1/auth/me").set("authorization","Bearer "+firstToken).expect(200);
  await request(localAuthApp).post("/v1/auth/logout").set("authorization","Bearer "+firstToken).expect(200);
  await request(localAuthApp).get("/v1/auth/me").set("authorization","Bearer "+firstToken).expect(401);
  await request(localAuthApp).post("/v1/auth/login").send({email,password}).expect(200);
  await request(localAuthApp).post("/v1/auth/login").send({email,password:"wrong-password-value"}).expect(401);
 });
 it("clears local credentials and revokes sessions during account erasure",async()=>{
  const registered=await request(localAuthApp).post("/v1/auth/register").send({email:"erase-local@example.test",password:"account-erasure-password-2026"}).expect(201);
  const token=registered.body.data.accessToken as string;const subject=registered.body.data.user.authSubject as string;
  await pool.query("SELECT request_account_erasure($1,$2)",[subject,createHash("sha256").update(subject).digest("hex")]);
  const user=await pool.query("SELECT is_active,email,password_hash,role FROM app_users WHERE auth_subject LIKE 'erased:%' AND id=$1",[registered.body.data.user.id]);
  expect(user.rows[0]).toMatchObject({is_active:false,email:null,password_hash:null,role:"member"});
  expect((await pool.query("SELECT session_id_hash FROM auth_sessions WHERE user_id=$1",[registered.body.data.user.id])).rows).toHaveLength(0);
  await request(localAuthApp).get("/v1/auth/me").set("authorization","Bearer "+token).expect(401);
 });
 it("requires the one-time invite code to claim an existing email as moderator",async()=>{
  const email="new-moderator@example.test";
  const existing=await request(localAuthApp).post("/v1/auth/register").send({email,password:"old-member-password-2026"}).expect(201);
  const oldToken=existing.body.data.accessToken as string;
  const admin=await pool.query("INSERT INTO app_users(auth_subject,email,password_hash,role) VALUES($1,$2,$3,'admin') RETURNING id",["integration:admin","root@example.test","scrypt-placeholder"]);
  const token="A".repeat(43),tokenHash=createHash("sha256").update(token).digest("hex");
  await pool.query("INSERT INTO auth_sessions(session_id_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash,admin.rows[0].id]);
  const invitation=await request(localAuthApp).post("/v1/auth/admin/moderators").set("authorization","Bearer "+token).send({email}).expect(201);
  const inviteCode=invitation.body.data.inviteCode as string;expect(inviteCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await pool.query("SELECT email FROM moderator_invites WHERE email=$1",[email])).rows).toHaveLength(1);
  await request(localAuthApp).post("/v1/auth/register").send({email,password:"new-moderator-password-2026"}).expect(403,{error:"MODERATOR_INVITE_CODE_REQUIRED"});
  const registered=await request(localAuthApp).post("/v1/auth/register").send({email,password:"new-moderator-password-2026",moderatorInviteToken:inviteCode}).expect(201);
  const moderatorId=registered.body.data.user.id as string;const newToken=registered.body.data.accessToken as string;
  expect(registered.body.data.user.role).toBe("moderator");
  expect((await pool.query("SELECT email FROM moderator_invites WHERE email=$1",[email])).rows).toHaveLength(0);
  expect((await pool.query("SELECT action FROM user_role_audit WHERE target_user_id=$1",[moderatorId])).rows.map(row=>row.action)).toEqual(["moderator_invited"]);
  await request(localAuthApp).get("/v1/auth/me").set("authorization","Bearer "+oldToken).expect(401);
  await request(localAuthApp).get("/v1/auth/me").set("authorization","Bearer "+newToken).expect(200);
  await request(localAuthApp).post("/v1/auth/admin/moderators/revoke").set("authorization","Bearer "+token).send({email}).expect(200);
  expect((await pool.query("SELECT role FROM app_users WHERE id=$1",[moderatorId])).rows[0].role).toBe("member");
 });
 it("creates a new moderator account from a one-time invitation code",async()=>{
  const admin=await pool.query("INSERT INTO app_users(auth_subject,email,password_hash,role) VALUES($1,$2,$3,'admin') RETURNING id",["integration:admin-new","root-new@example.test","scrypt-placeholder"]);
  const token="C".repeat(43),tokenHash=createHash("sha256").update(token).digest("hex");
  await pool.query("INSERT INTO auth_sessions(session_id_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash,admin.rows[0].id]);
  const invitation=await request(localAuthApp).post("/v1/auth/admin/moderators").set("authorization","Bearer "+token).send({email:"brand-new-moderator@example.test"}).expect(201);
  const inviteCode=invitation.body.data.inviteCode as string;
  const registered=await request(localAuthApp).post("/v1/auth/register").send({email:"brand-new-moderator@example.test",password:"brand-new-moderator-password",moderatorInviteToken:inviteCode}).expect(201);
  expect(registered.body.data.user.role).toBe("moderator");
  const audit=await pool.query("SELECT action FROM user_role_audit WHERE target_user_id=$1",[registered.body.data.user.id]);
  expect(audit.rows.map(row=>row.action)).toEqual(["moderator_invited"]);
 });
 it("rejects moderator management without an active admin session",async()=>{
  const member=await pool.query("INSERT INTO app_users(auth_subject,email,password_hash) VALUES($1,$2,$3) RETURNING id",["integration:member","member@example.test","scrypt-placeholder"]);
  const token="B".repeat(43),tokenHash=createHash("sha256").update(token).digest("hex");
  await pool.query("INSERT INTO auth_sessions(session_id_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash,member.rows[0].id]);
  await request(localAuthApp).post("/v1/auth/admin/moderators").set("authorization","Bearer "+token).send({email:"bad-invite@example.test"}).expect(403);
  expect((await pool.query("SELECT email FROM moderator_invites WHERE email=$1",["bad-invite@example.test"])).rows).toHaveLength(0);
 });
 it("serves the official agency directory with source-linked contact details",async()=>{
  const response=await request(app).get("/v1/agencies").expect(200);
  expect(response.body.data.length).toBeGreaterThanOrEqual(4);
  const lasema=response.body.data.find((agency:{acronym:string})=>agency.acronym==="LASEMA");
  expect(lasema).toMatchObject({name:"Lagos State Emergency Management Agency",scope:"Lagos State",sourceUrl:"https://lasema.com.ng/contact/"});
  expect(lasema.contacts.map((contact:{phoneNumber:string})=>contact.phoneNumber)).toEqual(expect.arrayContaining(["112","767","+2347035438447"]));
  const efcc=response.body.data.find((agency:{acronym:string})=>agency.acronym==="EFCC");
  expect(efcc.contacts.some((contact:{phoneNumber:string})=>contact.phoneNumber==="+2348093322644")).toBe(true);
  const nscdc=response.body.data.find((agency:{acronym:string})=>agency.acronym==="NSCDC");
  expect(nscdc.contacts.some((contact:{phoneNumber:string})=>contact.phoneNumber==="199")).toBe(false);
  const police=response.body.data.find((agency:{acronym:string})=>agency.acronym==="NPF");
  expect(police.contacts).toHaveLength(0);
  const validPhone=/^(\+234[0-9]{7,10}|[0-9]{3,6})$/;
  expect(response.body.data.every((agency:{contacts:{phoneNumber:string}[]})=>agency.contacts.every(contact=>validPhone.test(contact.phoneNumber)))).toBe(true);
  expect(response.body.data.every((agency:{sourceUrl:string;sourceVerifiedAt:string;nextReviewAt:string})=>agency.sourceUrl.startsWith("https://")&&new Date(agency.nextReviewAt)>new Date(agency.sourceVerifiedAt))).toBe(true);
 });
 it("serves the national and Lagos emergency call lines with official sources",async()=>{
  const response=await request(app).get("/v1/emergency-contacts?state=Lagos").expect(200);
  const numbers=response.body.data.map((contact:{phoneNumber:string})=>contact.phoneNumber);
  expect(numbers).toHaveLength(2);expect(numbers).toEqual(expect.arrayContaining(["112","767"]));
  expect(response.body.data.every((contact:{sourceUrl:string;nextReviewAt:string;verifiedAt:string})=>contact.sourceUrl.startsWith("https://")&&new Date(contact.nextReviewAt)>new Date(contact.verifiedAt))).toBe(true);
  const nationwide=await request(app).get("/v1/emergency-contacts").expect(200);expect(nationwide.body.data.map((contact:{phoneNumber:string})=>contact.phoneNumber)).toEqual(["112"]);
  const otherState=await request(app).get("/v1/emergency-contacts?state=Oyo").expect(200);expect(otherState.body.data.map((contact:{phoneNumber:string})=>contact.phoneNumber)).toEqual(["112"]);
 });
 it("publishes only reviewed records and paginates correctly when timestamps tie",async()=>{
  const first=await request(app).get("/v1/incidents?limit=1").expect(200);expect(first.body.data).toHaveLength(1);expect(first.body.data[0].title).toBe("Published first incident");expect(first.body.nextCursor).toBeTypeOf("string");
  const second=await request(app).get(`/v1/incidents?limit=1&cursor=${first.body.nextCursor}`).expect(200);expect(second.body.data).toHaveLength(1);expect(second.body.data[0].title).toBe("Published second incident");expect(second.body.nextCursor).toBeNull();
 });
 it("filters by state using parameterized query values",async()=>{const response=await request(app).get("/v1/incidents?state=Oyo").expect(200);expect(response.body.data).toHaveLength(1);expect(response.body.data[0].state).toBe("Oyo");});
 it("accepts a signed-in report but keeps it private and pending",async()=>{
  const response=await request(authenticatedApp).post("/v1/reports").send({title:"Road obstruction near Ikeja",summary:"A fallen tree is blocking one lane near the junction. Drivers should take care while the report is reviewed.",category:"road_accident",state:"Lagos",locality:"Ikeja",occurredAt:"2026-11-02T08:00:00.000Z"}).expect(202);
  reportId=response.body.data.id;expect(response.body.data.status).toBe("pending_review");
  const stored=await pool.query("SELECT r.status,u.auth_subject FROM incident_reports r JOIN app_users u ON u.id=r.reporter_id WHERE r.id=$1",[reportId]);expect(stored.rows[0].status).toBe("pending_review");expect(stored.rows[0].auth_subject).toBe("integration|member");
  const mine=await request(authenticatedApp).get("/v1/reports/mine").expect(200);expect(mine.body.data.some((item:{id:string})=>item.id===reportId)).toBe(true);expect(JSON.stringify(mine.body)).not.toContain("integration|member");
 });
 it("allows only moderators to see the review queue and hides reporter identity",async()=>{
  await request(authenticatedApp).get("/v1/moderation/reports").expect(403);
  const response=await request(moderationApp).get("/v1/moderation/reports").set("authorization","Bearer "+moderatorToken).expect(200);expect(response.body.data.some((item:{id:string})=>item.id===reportId)).toBe(true);expect(JSON.stringify(response.body)).not.toContain("integration|member");
  const sources=await request(moderationApp).get("/v1/moderation/sources").set("authorization","Bearer "+moderatorToken).expect(200);expect(sources.body.data).toHaveLength(1);expect(sources.body.data[0]).toMatchObject({publisherName:"Lagos Emergency Management Agency",isOfficial:true});
  await request(authenticatedApp).get("/v1/moderation/sources").expect(403);
 });
 it("requires approved official evidence before publishing a report",async()=>{
  const response=await request(moderationApp).post(`/v1/moderation/reports/${reportId}/decision`).set("authorization","Bearer "+moderatorToken).send({decision:"approve",reason:"Confirmed against the agency-owned public notice.",verificationStatus:"officially_confirmed",sources:[{sourceRegistryId,sourceUrl:"https://agency.gov.ng/notices/123"}]}).expect(200);
  const incidentId=response.body.data.incidentId;
  const stored=await pool.query("SELECT r.status,r.incident_id,i.status AS incident_status,i.verification_status FROM incident_reports r JOIN incidents i ON i.id=r.incident_id WHERE r.id=$1",[reportId]);
  expect(stored.rows[0]).toMatchObject({status:"approved",incident_status:"published",verification_status:"officially_confirmed"});expect(stored.rows[0].incident_id).toBe(incidentId);
  const evidence=await pool.query("SELECT source_registry_id,source_url FROM incident_sources WHERE incident_id=$1",[incidentId]);expect(evidence.rows).toHaveLength(1);expect(evidence.rows[0].source_registry_id).toBe(sourceRegistryId);
 });
 it("prevents a report from being moderated twice",async()=>{await request(moderationApp).post(`/v1/moderation/reports/${reportId}/decision`).set("authorization","Bearer "+moderatorToken).send({decision:"reject",reason:"Duplicate moderation attempt"}).expect(409,{error:"REPORT_ALREADY_REVIEWED"});});
 it("rejects incident locations outside Nigeria",async()=>{await expect(pool.query("INSERT INTO incidents(title,summary,category,state,occurred_at) VALUES($1,$2,$3,$4,now())",["Invalid geography report","This report should fail because its location is not within Nigeria.","robbery","Accra"])).rejects.toThrow();});
 it("does not allow an unverified or source-less incident to be published",async()=>{await expect(pool.query("INSERT INTO incidents(title,summary,category,state,occurred_at,published_at,verification_status,status,source_count,public_source_url,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,now(),now(),'unverified','published',0,NULL,$5,now())",["Unverified public claim","This claim has not been corroborated and must not be published as a fact.","robbery","Lagos","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])).rejects.toThrow();});
 it("does not allow an unreviewed source to be marked approved",async()=>{await expect(pool.query("INSERT INTO source_registry(publisher_name,display_name,canonical_url,feed_url,source_kind,approval_status) VALUES($1,$2,$3,$4,$5,$6)",["Unreviewed Publisher","Unreviewed Feed","https://example.org","https://example.org/feed.xml","rss","approved"])).rejects.toThrow();});
 it("does not approve sources that disallow robots access",async()=>{await expect(pool.query("INSERT INTO source_registry(publisher_name,display_name,canonical_url,feed_url,source_kind,robots_checked_at,robots_allowed,terms_reviewed_at,approval_status,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,now(),false,now(),'approved',$6,now())",["Blocked Publisher","Blocked Feed","https://blocked.example","https://blocked.example/feed.xml","rss","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])).rejects.toThrow();});
 it("approves a pending source only after policy attestations and records the audit",async()=>{
  const pending=await pool.query("INSERT INTO source_registry(publisher_name,display_name,canonical_url,feed_url,source_kind,terms_url,approval_status) VALUES($1,$2,$3,$4,'rss',$5,'pending') RETURNING id",["Integration Publisher","Integration Feed","https://publisher.example","https://publisher.example/feed.xml","https://publisher.example/terms"]);
  const id=pending.rows[0].id as string;
  await request(moderationApp).post("/v1/moderation/source-registry/"+id+"/decision").set("authorization","Bearer "+moderatorToken).send({decision:"approve",reason:"Reviewed publisher policy and access rules.",robotsAllowed:true,termsReviewed:true}).expect(200,{data:{sourceId:id,approvalStatus:"approved"}});
  const stored=await pool.query("SELECT approval_status,robots_allowed,robots_checked_at,terms_reviewed_at,approved_by,approved_at FROM source_registry WHERE id=$1",[id]);
  expect(stored.rows[0]).toMatchObject({approval_status:"approved",robots_allowed:true,approved_by:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"});
  expect(stored.rows[0].robots_checked_at).toBeTruthy();expect(stored.rows[0].terms_reviewed_at).toBeTruthy();expect(stored.rows[0].approved_at).toBeTruthy();
  const audit=await pool.query("SELECT action,reason FROM source_registry_moderation_audit WHERE source_registry_id=$1",[id]);
  expect(audit.rows).toEqual([{action:"approve",reason:"Reviewed publisher policy and access rules."}]);
 });
});
