import {describe,expect,it,vi} from "vitest";
import request from "supertest";
import type {RequestHandler} from "express";
import {createApp} from "../src/app.js";

const moderatorId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const auth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"test|moderator"};next();};

describe("source registry moderation API",()=>{
 it("lists pending sources only to moderators",async()=>{
  const query=vi.fn()
   .mockResolvedValueOnce({rows:[{id:moderatorId,role:"moderator",is_active:true}]})
   .mockResolvedValueOnce({rows:[{id:sourceId,publisher_name:"Example Publisher",display_name:"Example Feed",canonical_url:"https://example.test/",feed_url:"https://example.test/feed",source_kind:"rss",terms_url:"https://example.test/terms",licence_name:null,attribution_text:"Link to source",is_official:false,polling_interval_seconds:900,retention_days:90,robots_checked_at:null,robots_allowed:null,terms_reviewed_at:null,approval_status:"pending",approved_at:null,created_at:new Date("2026-11-03T10:00:00Z")}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  const response=await request(app).get("/v1/moderation/source-registry?status=pending").expect(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0]).toMatchObject({id:sourceId,publisherName:"Example Publisher",approvalStatus:"pending"});
  expect(query.mock.calls[1]?.[0]).toContain("approval_status=$1::source_approval_status");
 });

 it("requires moderator privileges before listing sources",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{id:moderatorId,role:"member",is_active:true}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).get("/v1/moderation/source-registry").expect(403);
  expect(query).toHaveBeenCalledOnce();
 });

 it("does not approve a source unless both policy checks are confirmed",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{id:moderatorId,role:"moderator",is_active:true}]});
  const connect=vi.fn();
  const app=createApp({pool:{query,connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsAllowed:true,termsReviewed:false,reason:"Reviewed publisher terms"})
   .expect(422,{error:"ROBOTS_AND_TERMS_REVIEW_REQUIRED"});
  expect(connect).not.toHaveBeenCalled();
 });

 it("records an approved source and its audit entry in one transaction",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{id:moderatorId,role:"moderator",is_active:true}]});
  const clientQuery=vi.fn()
   .mockResolvedValueOnce({})
   .mockResolvedValueOnce({rows:[{id:sourceId,approval_status:"pending"}]})
   .mockResolvedValueOnce({})
   .mockResolvedValueOnce({})
   .mockResolvedValueOnce({});
  const release=vi.fn();
  const connect=vi.fn().mockResolvedValue({query:clientQuery,release});
  const app=createApp({pool:{query,connect} as never,allowedOrigins:[],authMiddleware:auth});
  const response=await request(app).post("/v1/moderation/source-registry/"+sourceId+"/decision")
   .send({decision:"approve",robotsAllowed:true,termsReviewed:true,reason:"Robots and publisher terms reviewed by moderator"})
   .expect(200);
  expect(response.body.data).toEqual({sourceId,approvalStatus:"approved"});
  expect(clientQuery.mock.calls.map(call=>call[0])).toEqual(["BEGIN",expect.stringContaining("FOR UPDATE"),expect.stringContaining("UPDATE source_registry"),expect.stringContaining("INSERT INTO source_registry_audit"),"COMMIT"]);
  expect(release).toHaveBeenCalledOnce();
 });
});
