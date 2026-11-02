import {afterAll,beforeAll,describe,expect,it} from "vitest";
import type {RequestHandler} from "express";
import pg from "pg";
import request from "supertest";
import {createApp} from "../src/app.js";
import {applyMigrations} from "../src/migrate.js";
const {Pool}=pg;
const databaseUrl=process.env.DATABASE_URL;
const reportAuth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"integration|member"};next();};
const moderatorAuth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"integration|moderator"};next();};
describe.skipIf(!databaseUrl)("PostgreSQL incident, report and moderation integration",()=>{
 const pool=new Pool({connectionString:databaseUrl});
 const app=createApp({pool,allowedOrigins:[]});
 const authenticatedApp=createApp({pool,allowedOrigins:[],authMiddleware:reportAuth});
 const moderationApp=createApp({pool,allowedOrigins:[],authMiddleware:moderatorAuth});
 let sourceRegistryId="";let reportId="";
 beforeAll(async()=>{
  await Promise.all([applyMigrations(pool),applyMigrations(pool)]);await applyMigrations(pool);
  await pool.query("TRUNCATE report_moderation_audit,incident_reports,app_users,moderation_audit,incident_sources,incidents,source_registry RESTART IDENTITY CASCADE");
  const moderatorId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await pool.query("INSERT INTO app_users(id,auth_subject,role) VALUES($1,$2,'moderator')",[moderatorId,"integration|moderator"]);
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
 it("records both migrations once and skips them on subsequent runs",async()=>{
  const result=await pool.query("SELECT version FROM schema_migrations ORDER BY version");
  expect(result.rows.map(row=>row.version)).toEqual(["0001_initial.sql","0002_auth_reports.sql"]);
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
  const response=await request(moderationApp).get("/v1/moderation/reports").expect(200);expect(response.body.data.some((item:{id:string})=>item.id===reportId)).toBe(true);expect(JSON.stringify(response.body)).not.toContain("integration|member");
  const sources=await request(moderationApp).get("/v1/moderation/sources").expect(200);expect(sources.body.data).toHaveLength(1);expect(sources.body.data[0]).toMatchObject({publisherName:"Lagos Emergency Management Agency",isOfficial:true});
  await request(authenticatedApp).get("/v1/moderation/sources").expect(403);
 });
 it("requires approved official evidence before publishing a report",async()=>{
  const response=await request(moderationApp).post(`/v1/moderation/reports/${reportId}/decision`).send({decision:"approve",reason:"Confirmed against the agency-owned public notice.",verificationStatus:"officially_confirmed",sources:[{sourceRegistryId,sourceUrl:"https://agency.gov.ng/notices/123"}]}).expect(200);
  const incidentId=response.body.data.incidentId;
  const stored=await pool.query("SELECT r.status,r.incident_id,i.status AS incident_status,i.verification_status FROM incident_reports r JOIN incidents i ON i.id=r.incident_id WHERE r.id=$1",[reportId]);
  expect(stored.rows[0]).toMatchObject({status:"approved",incident_status:"published",verification_status:"officially_confirmed"});expect(stored.rows[0].incident_id).toBe(incidentId);
  const evidence=await pool.query("SELECT source_registry_id,source_url FROM incident_sources WHERE incident_id=$1",[incidentId]);expect(evidence.rows).toHaveLength(1);expect(evidence.rows[0].source_registry_id).toBe(sourceRegistryId);
 });
 it("prevents a report from being moderated twice",async()=>{await request(moderationApp).post(`/v1/moderation/reports/${reportId}/decision`).send({decision:"reject",reason:"Duplicate moderation attempt"}).expect(409,{error:"REPORT_ALREADY_REVIEWED"});});
 it("rejects incident locations outside Nigeria",async()=>{await expect(pool.query("INSERT INTO incidents(title,summary,category,state,occurred_at) VALUES($1,$2,$3,$4,now())",["Invalid geography report","This report should fail because its location is not within Nigeria.","robbery","Accra"])).rejects.toThrow();});
 it("does not allow an unverified or source-less incident to be published",async()=>{await expect(pool.query("INSERT INTO incidents(title,summary,category,state,occurred_at,published_at,verification_status,status,source_count,public_source_url,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,now(),now(),'unverified','published',0,NULL,$5,now())",["Unverified public claim","This claim has not been corroborated and must not be published as a fact.","robbery","Lagos","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])).rejects.toThrow();});
 it("does not allow an unreviewed source to be marked approved",async()=>{await expect(pool.query("INSERT INTO source_registry(publisher_name,display_name,canonical_url,feed_url,source_kind,approval_status) VALUES($1,$2,$3,$4,$5,$6)",["Unreviewed Publisher","Unreviewed Feed","https://example.org","https://example.org/feed.xml","rss","approved"])).rejects.toThrow();});
 it("does not approve sources that disallow robots access",async()=>{await expect(pool.query("INSERT INTO source_registry(publisher_name,display_name,canonical_url,feed_url,source_kind,robots_checked_at,robots_allowed,terms_reviewed_at,approval_status,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,now(),false,now(),'approved',$6,now())",["Blocked Publisher","Blocked Feed","https://blocked.example","https://blocked.example/feed.xml","rss","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])).rejects.toThrow();});
});
