import {describe,expect,it,vi} from "vitest";
import request from "supertest";
import type {RequestHandler} from "express";
import {createApp} from "../src/app.js";

const moderatorId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const termsUrl="https://example.test/terms";
const auth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"test|moderator"};next();};
function moderatorQuery(){return vi.fn().mockResolvedValue({rows:[{id:moderatorId,role:"moderator",is_active:true}]});}
function sourceClient(approvalStatus="pending",sourceTermsUrl:string|null=termsUrl){
 const clientQuery=vi.fn()
  .mockResolvedValueOnce({})
  .mockResolvedValueOnce({rows:[{id:sourceId,approval_status:approvalStatus,terms_url:sourceTermsUrl}]});
 const release=vi.fn();
 const connect=vi.fn().mockResolvedValue({query:clientQuery,release});
 return {clientQuery,release,connect};
}

describe("source registry moderation API",()=>{
 it("lists pending sources only to moderators",async()=>{
  const query=vi.fn()
   .mockResolvedValueOnce({rows:[{id:moderatorId,role:"moderator",is_active:true}]})
   .mockResolvedValueOnce({rows:[{id:sourceId,publisher_name:"Example Publisher",display_name:"Example Feed",canonical_url:"https://example.test/",feed_url:"https://example.test/feed",source_kind:"rss",terms_url:termsUrl,licence_name:null,attribution_text:"Link to source",is_official:false,polling_interval_seconds:900,retention_days:90,robots_checked_at:null,robots_allowed:null,terms_reviewed_at:null,approval_status:"pending",approved_at:null,created_at:new Date("2026-11-03T10:00:00Z")}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  const response=await request(app).get("/v1/moderation/source-registry?status=pending").expect(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0]).toMatchObject({id:sourceId,publisherName:"Example Publisher",approvalStatus:"pending"});
  expect(query.mock.calls[1]?.[0]).toContain("approval_status=$1::source_approval_status");
 });

 it("rejects invalid status filters",async()=>{
  const query=moderatorQuery();
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).get("/v1/moderation/source-registry?status=unknown").expect(400,{error:"INVALID_STATUS"});
  expect(query).toHaveBeenCalledOnce();
 });

 it("requires moderator privileges before listing sources",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{id:moderatorId,role:"member",is_active:true}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).get("/v1/moderation/source-registry").expect(403);
  expect(query).toHaveBeenCalledOnce();
 });

 it("validates source ids and request bodies before opening a transaction",async()=>{
  const query=moderatorQuery();
  const connect=vi.fn();
  const app=createApp({pool:{query,connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/not-a-uuid/decision")
   .send({decision:"reject",robotsResult:"not_checked",termsReviewed:false,reason:"A sufficiently long review reason"}).expect(400,{error:"INVALID_SOURCE_ID"});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsAllowed:true,termsReviewed:true,reason:"A sufficiently long review reason"}).expect(400);
  expect(connect).not.toHaveBeenCalled();
 });

 it("does not approve unless robots are explicitly allowed and terms are reviewed",async()=>{
  const query=moderatorQuery();
  const connect=vi.fn();
  const app=createApp({pool:{query,connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsResult:"disallowed",termsReviewed:true,reason:"Reviewed publisher terms carefully"}).expect(422,{error:"ROBOTS_AND_TERMS_REVIEW_REQUIRED"});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsResult:"allowed",termsReviewed:false,reason:"Reviewed publisher terms carefully"}).expect(422,{error:"ROBOTS_AND_TERMS_REVIEW_REQUIRED"});
  expect(connect).not.toHaveBeenCalled();
 });

 it("refuses approval when the source has no terms URL",async()=>{
  const query=moderatorQuery();
  const db=sourceClient("pending",null);
  const app=createApp({pool:{query,connect:db.connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsResult:"allowed",termsReviewed:true,reason:"Reviewed available publisher terms"}).expect(422,{error:"SOURCE_TERMS_URL_MISSING"});
  expect(db.clientQuery.mock.calls.map(call=>call[0])).toEqual(["BEGIN",expect.stringContaining("terms_url"),"ROLLBACK"]);
  expect(db.release).toHaveBeenCalledOnce();
 });

 it("records an approval and its audit entry in one transaction",async()=>{
  const query=moderatorQuery();
  const db=sourceClient();
  db.clientQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({});
  const app=createApp({pool:{query,connect:db.connect} as never,allowedOrigins:[],authMiddleware:auth});
  const response=await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsResult:"allowed",termsReviewed:true,reason:"Robots and publisher terms reviewed by moderator"}).expect(200);
  expect(response.body.data).toEqual({sourceId,approvalStatus:"approved"});
  expect(db.clientQuery.mock.calls.map(call=>call[0])).toEqual(["BEGIN",expect.stringContaining("FOR UPDATE"),expect.stringContaining("UPDATE source_registry"),expect.stringContaining("INSERT INTO source_registry_audit"),"COMMIT"]);
  expect(db.clientQuery.mock.calls[2]?.[1]).toEqual([sourceId,true,true,true,"approved",moderatorId]);
  expect(db.clientQuery.mock.calls[3]?.[1]).toEqual([sourceId,moderatorId,"approve","Robots and publisher terms reviewed by moderator",true,true]);
  expect(db.release).toHaveBeenCalledOnce();
 });

 it("records an unchecked robots result as null when rejecting",async()=>{
  const query=moderatorQuery();
  const db=sourceClient();
  db.clientQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({});
  const app=createApp({pool:{query,connect:db.connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"reject",robotsResult:"not_checked",termsReviewed:false,reason:"Rejected pending policy verification"}).expect(200);
  expect(db.clientQuery.mock.calls[2]?.[1]).toEqual([sourceId,false,null,false,"rejected",moderatorId]);
  expect(db.clientQuery.mock.calls[3]?.[1]).toEqual([sourceId,moderatorId,"reject","Rejected pending policy verification",null,false]);
  expect(db.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
 });

 it("rejects a duplicate approval without changing the source",async()=>{
  const query=moderatorQuery();
  const db=sourceClient("approved");
  const app=createApp({pool:{query,connect:db.connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsResult:"allowed",termsReviewed:true,reason:"Repeated approval should not overwrite"}).expect(409,{error:"SOURCE_ALREADY_APPROVED"});
  expect(db.clientQuery.mock.calls.map(call=>call[0])).toEqual(["BEGIN",expect.stringContaining("FOR UPDATE"),"ROLLBACK"]);
  expect(db.release).toHaveBeenCalledOnce();
 });

 it("returns 404 for a source that does not exist",async()=>{
  const query=moderatorQuery();
  const clientQuery=vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({});
  const release=vi.fn();
  const connect=vi.fn().mockResolvedValue({query:clientQuery,release});
  const app=createApp({pool:{query,connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"reject",robotsResult:"not_checked",termsReviewed:false,reason:"Source record could not be verified"}).expect(404,{error:"SOURCE_NOT_FOUND"});
  expect(clientQuery.mock.calls.map(call=>call[0])).toEqual(["BEGIN",expect.stringContaining("FOR UPDATE"),"ROLLBACK"]);
  expect(release).toHaveBeenCalledOnce();
 });

 it("rolls back the source update if the audit insert fails",async()=>{
  const query=moderatorQuery();
  const db=sourceClient();
  db.clientQuery.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("audit insert failed")).mockResolvedValueOnce({});
  const app=createApp({pool:{query,connect:db.connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsResult:"allowed",termsReviewed:true,reason:"Robots and publisher terms reviewed by moderator"}).expect(500);
  expect(db.clientQuery.mock.calls.map(call=>call[0])).toEqual(["BEGIN",expect.stringContaining("FOR UPDATE"),expect.stringContaining("UPDATE source_registry"),expect.stringContaining("INSERT INTO source_registry_audit"),"ROLLBACK"]);
  expect(db.release).toHaveBeenCalledOnce();
 });
});
