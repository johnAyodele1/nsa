import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { Pool } from "pg";
import { z } from "zod";
import { incidentListResponseSchema, incidentQuerySchema } from "@nsa/contracts";
const cursorPayloadSchema=z.object({publishedAt:z.string().datetime(),id:z.string().uuid()}).strict();
type Dependencies={pool:Pick<Pool,"query">|null;allowedOrigins:string[]};
const encodeCursor=(payload:{publishedAt:string;id:string})=>Buffer.from(JSON.stringify(payload)).toString("base64url");
function decodeCursor(value:string){try{const parsed=cursorPayloadSchema.safeParse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));return parsed.success?parsed.data:null;}catch{return null;}}
export function createApp({pool,allowedOrigins}:Dependencies){
 const app=express();app.disable("x-powered-by");app.disable("etag");app.use(helmet());
 app.use(cors({origin(origin,callback){if(!origin||allowedOrigins.includes(origin))return callback(null,true);return callback(null,false);},methods:["GET","POST"],allowedHeaders:["Content-Type","Authorization"],maxAge:600}));
 app.use(express.json({limit:"64kb",strict:true}));
 app.use("/v1",rateLimit({windowMs:60000,limit:120,standardHeaders:"draft-8",legacyHeaders:false,message:{error:"RATE_LIMITED"}}));
 app.get("/health/live",(_req,res)=>res.status(200).json({status:"ok"}));
 app.get("/health/ready",async(_req,res)=>{if(!pool)return res.status(503).json({status:"not_ready",database:"not_configured"});try{await pool.query("SELECT 1");return res.status(200).json({status:"ready",database:"connected"});}catch{return res.status(503).json({status:"not_ready",database:"unavailable"});}});
 app.get("/v1/incidents",async(req,res,next)=>{
  const parsed=incidentQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:"INVALID_QUERY",details:parsed.error.flatten()});if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  const {state,category,limit,cursor}=parsed.data;const params:(string|number)[]=[];const filters=["status = 'published'","deleted_at IS NULL"];
  if(state){params.push(state);filters.push(`state = $${params.length}`);}if(category){params.push(category);filters.push(`category = $${params.length}`);}
  if(cursor){const decoded=decodeCursor(cursor);if(!decoded)return res.status(400).json({error:"INVALID_CURSOR"});params.push(decoded.publishedAt,decoded.id);filters.push(`(published_at,id) < ($${params.length-1}::timestamptz,$${params.length}::uuid)`);}
  params.push(limit+1);
  try{const result=await pool.query(`SELECT id,title,summary,category,state,locality,occurred_at,published_at,verification_status,source_count,public_source_url FROM incidents WHERE ${filters.join(" AND ")} ORDER BY published_at DESC,id DESC LIMIT $${params.length}`,params);
   const hasMore=result.rows.length>limit;const rows=result.rows.slice(0,limit).map(row=>({id:row.id,title:row.title,summary:row.summary,category:row.category,state:row.state,locality:row.locality,occurredAt:new Date(row.occurred_at).toISOString(),publishedAt:new Date(row.published_at).toISOString(),verificationStatus:row.verification_status,sourceCount:row.source_count,publicSourceUrl:row.public_source_url}));
   const last=rows.at(-1);return res.status(200).json(incidentListResponseSchema.parse({data:rows,nextCursor:hasMore&&last?encodeCursor({publishedAt:last.publishedAt,id:last.id}):null}));
  }catch(error){return next(error);}
 });
 app.use((_req,res)=>res.status(404).json({error:"NOT_FOUND"}));
 const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{if(res.headersSent)return;if(error instanceof SyntaxError&&"body"in error){res.status(400).json({error:"INVALID_JSON"});return;}console.error("Unhandled API error",error);res.status(500).json({error:"INTERNAL_SERVER_ERROR"});};app.use(errorHandler);return app;
}
