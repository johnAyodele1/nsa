import {describe,expect,it,vi} from "vitest";
import type {RequestHandler} from "express";
import request from "supertest";
import {createApp} from "../src/app.js";
import {createOidcAuthMiddleware} from "../src/auth.js";
const incident={id:"2f4e4b18-22b5-4d14-bbcb-17c48edc05d1",title:"Verified road closure notice",summary:"A road closure notice published by approved sources. Check the primary source for current diversion details.",category:"road_accident",state:"Lagos",locality:"Ikeja",occurred_at:new Date("2026-11-02T08:00:00.000Z"),published_at:new Date("2026-11-02T08:30:00.000Z"),verification_status:"corroborated",priority:"high",source_count:2,public_source_url:"https://example.gov.ng/notices/1"};
const reportBody={title:"Road obstruction near Ikeja",summary:"A fallen tree is blocking one lane near the junction. Drivers should take care while the report is reviewed.",category:"road_accident",state:"Lagos",locality:"Ikeja",occurredAt:"2026-11-02T08:00:00.000Z"};
const auth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"oidc|member-123"};next();};
describe("Express API",()=>{
 it("serves liveness without a database",async()=>{const app=createApp({pool:null,allowedOrigins:[]});await request(app).get("/health/live").expect(200,{status:"ok"});});
 it("reports database readiness accurately",async()=>{const app=createApp({pool:null,allowedOrigins:[]});await request(app).get("/health/ready").expect(503);});
 it("assigns server-generated request IDs and emits structured completion logs",async()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  try{
   const app=createApp({pool:null,allowedOrigins:[]});
   const response=await request(app).get("/health/live").set("x-request-id","untrusted-client-value").expect(200);
   expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
   expect(response.headers["x-request-id"]).not.toBe("untrusted-client-value");
   expect(log).toHaveBeenCalledOnce();
   const entry=JSON.parse(String(log.mock.calls[0]?.[0]));
   expect(entry).toMatchObject({level:"info",event:"http_request",requestId:response.headers["x-request-id"],method:"GET",path:"/health/live",statusCode:200});
   expect(entry.durationMs).toEqual(expect.any(Number));
  }finally{log.mockRestore();}
 });
 it("rejects invalid filters before querying",async()=>{const query=vi.fn();const app=createApp({pool:{query} as never,allowedOrigins:[]});await request(app).get("/v1/incidents?limit=500").expect(400);expect(query).not.toHaveBeenCalled();});
 it("returns feed records and applies the composite cursor to SQL",async()=>{const query=vi.fn().mockResolvedValue({rows:[incident,{...incident,id:"3f4e4b18-22b5-4d14-bbcb-17c48edc05d2"}]});const app=createApp({pool:{query} as never,allowedOrigins:[]});const cursor=Buffer.from(JSON.stringify({publishedAt:"2026-11-02T08:45:00.000Z",id:"4f4e4b18-22b5-4d14-bbcb-17c48edc05d3"})).toString("base64url");const response=await request(app).get(`/v1/incidents?limit=1&cursor=${cursor}`).expect(200);expect(response.body.data).toHaveLength(1);expect(response.body.nextCursor).toBeTypeOf("string");expect(query.mock.calls[0]?.[0]).toContain("status = 'published'");expect(query.mock.calls[0]?.[0]).toContain("(published_at,id) <");});
 it("applies state, category and priority filters as parameterized SQL predicates",async()=>{const query=vi.fn().mockResolvedValue({rows:[incident]});const app=createApp({pool:{query} as never,allowedOrigins:[]});await request(app).get("/v1/incidents?state=Lagos&category=road_accident&priority=high").expect(200);expect(query.mock.calls[0]?.[0]).toContain("state = $1");expect(query.mock.calls[0]?.[0]).toContain("category = $2");expect(query.mock.calls[0]?.[0]).toContain("priority = $3");expect(query.mock.calls[0]?.[1]).toEqual(["Lagos","road_accident","high",21]);});\n it("rejects malformed cursors without querying",async()=>{const query=vi.fn();const app=createApp({pool:{query} as never,allowedOrigins:[]});await request(app).get("/v1/incidents?cursor=bad").expect(400,{error:"INVALID_CURSOR"});expect(query).not.toHaveBeenCalled();});
 it("returns current emergency contacts for a valid state",async()=>{
  const now=new Date("2026-11-02T08:45:00.000Z");
  const query=vi.fn().mockResolvedValue({rows:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",agency_name:"Nigeria Emergency Communications Centre",label:"National emergency line",phone_number:"112",scope:"National",source_url:"https://ncc.gov.ng/node/3132",verified_at:now,next_review_at:new Date("2026-12-02T00:00:00.000Z")},{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",agency_name:"Lagos State Emergency Management Agency",label:"Lagos emergency line",phone_number:"767",scope:"Lagos State",source_url:"https://www.lagosstate.gov.ng/connect",verified_at:now,next_review_at:new Date("2026-12-02T00:00:00.000Z")}]});
  const app=createApp({pool:{query} as never,allowedOrigins:[]});
  const response=await request(app).get("/v1/emergency-contacts?state=Lagos").expect(200);
  expect(response.body.data.map((contact:{phoneNumber:string})=>contact.phoneNumber)).toEqual(["112","767"]);
  expect(query.mock.calls[0]?.[0]).toContain("next_review_at>now()");expect(query.mock.calls[0]?.[1]).toEqual(["Lagos"]);
 });
 it("rejects invalid emergency contact state filters before querying",async()=>{const query=vi.fn();const app=createApp({pool:{query} as never,allowedOrigins:[]});await request(app).get("/v1/emergency-contacts?state=Accra").expect(400);expect(query).not.toHaveBeenCalled();});
 it("returns not found for unknown routes",async()=>{const app=createApp({pool:null,allowedOrigins:[]});await request(app).get("/missing").expect(404,{error:"NOT_FOUND"});});
 it("fails closed when OIDC authentication is not configured",async()=>{const app=createApp({pool:null,allowedOrigins:[]});await request(app).post("/v1/reports").send(reportBody).expect(503,{error:"AUTH_NOT_CONFIGURED"});});
 it("requires bearer authentication when OIDC is configured",async()=>{const authMiddleware=createOidcAuthMiddleware({issuer:"https://identity.example",jwksUrl:"https://identity.example/.well-known/jwks.json",audience:"nsa-api"});const app=createApp({pool:null,allowedOrigins:[],authMiddleware});await request(app).post("/v1/reports").send(reportBody).expect(401,{error:"UNAUTHORIZED"});});
 it("rejects insecure OIDC endpoints",()=>{expect(()=>createOidcAuthMiddleware({issuer:"http://identity.example",jwksUrl:"https://identity.example/jwks",audience:"nsa-api"})).toThrow("must use HTTPS");});
 it("rejects malformed reports before opening a database transaction",async()=>{const connect=vi.fn();const app=createApp({pool:{connect} as never,allowedOrigins:[],authMiddleware:auth});await request(app).post("/v1/reports").send({...reportBody,state:"Accra"}).expect(400);expect(connect).not.toHaveBeenCalled();});
 it("stores authenticated reports as pending and keeps reporter identity out of the response",async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rows:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",is_active:true}]}).mockResolvedValueOnce({}).mockResolvedValueOnce({rows:[{count:0}]}).mockResolvedValueOnce({rows:[{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",status:"pending_review",created_at:new Date("2026-11-02T08:45:00.000Z")}] }).mockResolvedValueOnce({}),release:vi.fn()};
  const connect=vi.fn().mockResolvedValue(client);const app=createApp({pool:{connect} as never,allowedOrigins:[],authMiddleware:auth});
  const response=await request(app).post("/v1/reports").send(reportBody).expect(202);
  expect(response.body.data.status).toBe("pending_review");expect(response.body.data.id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  expect(JSON.stringify(response.body)).not.toContain("oidc|member-123");
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"),["oidc|member-123"]);
  expect(client.release).toHaveBeenCalledOnce();
 });
 it("limits a member to five reports per hour",async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rows:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",is_active:true}]}).mockResolvedValueOnce({}).mockResolvedValueOnce({rows:[{count:5}]}).mockResolvedValueOnce({}),release:vi.fn()};
  const connect=vi.fn().mockResolvedValue(client);const app=createApp({pool:{connect} as never,allowedOrigins:[],authMiddleware:auth});
  await request(app).post("/v1/reports").send(reportBody).expect(429,{error:"REPORT_LIMIT_REACHED"});
  expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO incident_reports"),expect.anything());
 });
});
