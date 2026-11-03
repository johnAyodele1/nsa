import express from "express";
import request from "supertest";
import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createAuthRouter,createLocalAuthMiddleware} from "../src/local-auth.js";

describe("local email authentication",()=>{
 it("rejects weak registration passwords before touching the database",async()=>{
  const connect=vi.fn();const pool={connect} as never;const app=express();app.use(express.json());app.use("/v1/auth",createAuthRouter(pool,createLocalAuthMiddleware(pool)));
  await request(app).post("/v1/auth/register").send({email:"person@example.com",password:"short"}).expect(400);
  expect(connect).not.toHaveBeenCalled();
 });
 it("hashes passwords and promotes an invited email only with its one-time code",async()=>{
  const inviteCode="I".repeat(43);const inviteHash=createHash("sha256").update(inviteCode).digest("hex");
  const client={query:vi.fn(async(sql:string,params?:unknown[])=>{
   if(sql.includes("SELECT invite_token_hash FROM moderator_invites"))return {rows:[{invite_token_hash:inviteHash}],rowCount:1};
   if(sql.includes("claim_moderator_invite"))return {rows:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",auth_subject:"local:subject",email:"mod@example.com",role:"moderator"}],rowCount:1};
   return {rows:[],rowCount:0};
  }),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as never;const app=express();app.use(express.json());app.use("/v1/auth",createAuthRouter(pool,createLocalAuthMiddleware(pool)));
  const response=await request(app).post("/v1/auth/register").send({email:"Mod@Example.com",password:"a-long-unique-password-123",moderatorInviteToken:inviteCode}).expect(201);
  expect(response.body.data.user).toMatchObject({email:"mod@example.com",role:"moderator",authSubject:"local:subject"});
  expect(response.body.data.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const claim=client.query.mock.calls.find(call=>call[0].includes("claim_moderator_invite"));
  expect(String(claim?.[1]?.[2]).startsWith("scrypt$16384$8$1$")).toBe(true);
  expect(claim?.[1]?.[2]).not.toBe("a-long-unique-password-123");
  expect(claim?.[1]).toHaveLength(4);
  expect(client.release).toHaveBeenCalledOnce();
 });
 it("authenticates only active users with a stored opaque session hash",async()=>{
  const token="A".repeat(43);const query=vi.fn()
   .mockResolvedValueOnce({rows:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",auth_subject:"local:subject",role:"member",is_active:true}],rowCount:1})
   .mockResolvedValueOnce({rows:[],rowCount:0})
   .mockResolvedValueOnce({rows:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",auth_subject:"local:subject",email:"person@example.com",role:"member"}],rowCount:1})
   .mockResolvedValue({rows:[],rowCount:0});
  const pool={query} as never;const app=express();app.use(express.json());app.use("/v1/auth",createAuthRouter(pool,createLocalAuthMiddleware(pool)));
  const response=await request(app).get("/v1/auth/me").set("authorization","Bearer "+token).expect(200);
  expect(response.body.data).toMatchObject({email:"person@example.com",role:"member"});
  expect(query.mock.calls[0]?.[1]?.[0]).not.toBe(token);
  expect(query.mock.calls[0]?.[1]?.[0]).toMatch(/^[a-f0-9]{64}$/);
 });
});
