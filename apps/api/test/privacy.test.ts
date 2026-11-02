import {describe,expect,it,vi} from "vitest";
import type {RequestHandler} from "express";
import request from "supertest";
import {createApp} from "../src/app.js";
const auth:RequestHandler=(_req,res,next)=>{res.locals.auth={subject:"privacy|member"};next();};
describe("privacy API",()=>{
 it("requires explicit account deletion confirmation",async()=>{const query=vi.fn();const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});await request(app).post("/v1/account/delete").send({}).expect(400);expect(query).not.toHaveBeenCalled();});
 it("records a privacy access request and its audit entry",async()=>{const query=vi.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",is_active:true}]}).mockResolvedValueOnce({rows:[{id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",status:"received",created_at:new Date("2026-11-02T10:00:00Z")}]}).mockResolvedValueOnce({rows:[]});const app=createApp({pool:{query} as never,allowedOrigins:[],authMiddleware:auth});const response=await request(app).post("/v1/privacy/requests").send({requestType:"access"}).expect(202);expect(response.body.data.status).toBe("received");expect(query).toHaveBeenCalledTimes(4);});
});
