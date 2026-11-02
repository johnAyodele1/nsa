import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {readFile} from "node:fs/promises";
import pg from "pg";
import request from "supertest";
import {createApp} from "../src/app.js";
const {Pool}=pg;
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL incident feed integration",()=>{
 const pool=new Pool({connectionString:databaseUrl});
 const app=createApp({pool,allowedOrigins:[]});
 beforeAll(async()=>{
  const migration=await readFile(new URL("../../../database/migrations/0001_initial.sql",import.meta.url),"utf8");
  await pool.query(migration);
  await pool.query("TRUNCATE moderation_audit,incident_sources,incidents,source_registry RESTART IDENTITY CASCADE");
  const insert=`INSERT INTO incidents(id,title,summary,category,state,locality,occurred_at,published_at,verification_status,status,source_count,public_source_url,reviewed_by,reviewed_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
  const rows=[
   ["3f4e4b18-22b5-4d14-bbcb-17c48edc05d2","Published first incident","This report has been reviewed and approved for public display by an authorized moderator.","road_accident","Lagos","Ikeja","2026-11-02T08:00:00Z","2026-11-02T08:30:00Z","corroborated","published",2,"https://example.gov.ng/first","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","2026-11-02T08:40:00Z"],
   ["2f4e4b18-22b5-4d14-bbcb-17c48edc05d1","Published second incident","This second reviewed public safety report is available from its original primary source.","fire","Oyo","Ibadan","2026-11-02T07:00:00Z","2026-11-02T08:30:00Z","officially_confirmed","published",1,"https://example.gov.ng/second","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","2026-11-02T08:40:00Z"],
   ["4f4e4b18-22b5-4d14-bbcb-17c48edc05d3","Pending unreviewed report","This report is still waiting for a moderator and must never appear in the public incident feed.","robbery","Lagos","Yaba","2026-11-02T09:00:00Z",null,"unverified","pending_review",0,null,null,null]
  ] as const;
  for(const row of rows)await pool.query(insert,[...row]);
 });
 afterAll(async()=>{await pool.end();});
 it("publishes only reviewed records and paginates correctly when timestamps tie",async()=>{
  const first=await request(app).get("/v1/incidents?limit=1").expect(200);
  expect(first.body.data).toHaveLength(1);
  expect(first.body.data[0].title).toBe("Published first incident");
  expect(first.body.nextCursor).toBeTypeOf("string");
  const second=await request(app).get(`/v1/incidents?limit=1&cursor=${first.body.nextCursor}`).expect(200);
  expect(second.body.data).toHaveLength(1);
  expect(second.body.data[0].title).toBe("Published second incident");
  expect(second.body.nextCursor).toBeNull();
 });
 it("filters by state using parameterized query values",async()=>{
  const response=await request(app).get("/v1/incidents?state=Oyo").expect(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0].state).toBe("Oyo");
 });
 it("rejects incident locations outside Nigeria",async()=>{
  await expect(pool.query("INSERT INTO incidents(title,summary,category,state,occurred_at) VALUES($1,$2,$3,$4,now())",["Invalid geography report","This report should fail because its location is not within Nigeria.","robbery","Accra"])).rejects.toThrow();
 });
 it("does not allow an unreviewed source to be marked approved",async()=>{
  await expect(pool.query("INSERT INTO source_registry(publisher_name,display_name,canonical_url,feed_url,source_kind,approval_status) VALUES($1,$2,$3,$4,$5,$6)",["Unreviewed Publisher","Unreviewed Feed","https://example.org","https://example.org/feed.xml","rss","approved"])).rejects.toThrow();
 });
});
