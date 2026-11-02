import {describe,expect,it,vi} from "vitest";
import request from "supertest";
import type {RequestHandler} from "express";
import {createApp} from "../src/app.js";
const moderatorId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const auth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"test|moderator"};next();};
describe("ingestion moderation API",()=>{
 it("returns a private staging queue only to moderators",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{id:moderatorId,role:"moderator",is_active:true}]}).mockResolvedValueOnce({rows:[{id:itemId,title:"Official road closure reported in Ikeja",summary:"An official notice describes a road closure in Ikeja. Drivers should follow the published diversion.",source_url:"https://agency.example/notice/1",source_published_at:new Date("2026-11-02T08:00:00Z"),created_at:new Date("2026-11-02T08:01:00Z"),publisher_name:"Agency Publisher",display_name:"Agency",is_official:true,canonical_url:"https://agency.example",licence_name:"Public notice",attribution_text:"Agency"}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  const response=await request(app).get("/v1/moderation/ingestion-items").expect(200);
  expect(response.body.data).toHaveLength(1);expect(response.body.data[0]).toMatchObject({id:itemId,publisherName:"Agency Publisher",isOfficial:true});expect(JSON.stringify(response.body)).not.toContain("auth_subject");
 });
 it("rejects non-moderators before reading staging items",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{id:moderatorId,role:"member",is_active:true}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).get("/v1/moderation/ingestion-items").expect(403);expect(query).toHaveBeenCalledOnce();
 });
 it("rejects an invalid queue limit",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{id:moderatorId,role:"moderator",is_active:true}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).get("/v1/moderation/ingestion-items?limit=500").expect(400);expect(query).toHaveBeenCalledOnce();
 });
 it("does not open a transaction for malformed decisions",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{id:moderatorId,role:"moderator",is_active:true}]});const connect=vi.fn();
  const app=createApp({pool:{query,connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post(`/v1/moderation/ingestion-items/${itemId}/decision`).send({decision:"publish",reason:"No evidence selected"}).expect(400);expect(connect).not.toHaveBeenCalled();
 });
});
