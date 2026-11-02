import {describe,expect,it,vi} from "vitest";
import request from "supertest";
import {createApp} from "../src/app.js";
const incident={id:"2f4e4b18-22b5-4d14-bbcb-17c48edc05d1",title:"Verified road closure notice",summary:"A road closure notice published by approved sources. Check the primary source for current diversion details.",category:"road_accident",state:"Lagos",locality:"Ikeja",occurred_at:new Date("2026-11-02T08:00:00.000Z"),published_at:new Date("2026-11-02T08:30:00.000Z"),verification_status:"corroborated",source_count:2,public_source_url:"https://example.gov.ng/notices/1"};
describe("Express API",()=>{
 it("serves liveness without a database",async()=>{const app=createApp({pool:null,allowedOrigins:[]});await request(app).get("/health/live").expect(200,{status:"ok"});});
 it("reports database readiness accurately",async()=>{const app=createApp({pool:null,allowedOrigins:[]});await request(app).get("/health/ready").expect(503);});
 it("rejects invalid filters before querying",async()=>{const query=vi.fn();const app=createApp({pool:{query} as never,allowedOrigins:[]});await request(app).get("/v1/incidents?limit=500").expect(400);expect(query).not.toHaveBeenCalled();});
 it("returns feed records and applies the composite cursor to SQL",async()=>{const query=vi.fn().mockResolvedValue({rows:[incident,{...incident,id:"3f4e4b18-22b5-4d14-bbcb-17c48edc05d2"}]});const app=createApp({pool:{query} as never,allowedOrigins:[]});const cursor=Buffer.from(JSON.stringify({publishedAt:"2026-11-02T08:45:00.000Z",id:"4f4e4b18-22b5-4d14-bbcb-17c48edc05d3"})).toString("base64url");const response=await request(app).get(`/v1/incidents?limit=1&cursor=${cursor}`).expect(200);expect(response.body.data).toHaveLength(1);expect(response.body.nextCursor).toBeTypeOf("string");expect(query.mock.calls[0]?.[0]).toContain("status = 'published'");expect(query.mock.calls[0]?.[0]).toContain("(published_at,id) <");});
 it("rejects malformed cursors without querying",async()=>{const query=vi.fn();const app=createApp({pool:{query} as never,allowedOrigins:[]});await request(app).get("/v1/incidents?cursor=bad").expect(400,{error:"INVALID_CURSOR"});expect(query).not.toHaveBeenCalled();});
 it("returns not found for unknown routes",async()=>{const app=createApp({pool:null,allowedOrigins:[]});await request(app).get("/missing").expect(404,{error:"NOT_FOUND"});});
});
