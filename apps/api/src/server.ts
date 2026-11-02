import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";
import {incidentListResponseSchema,incidentQuerySchema} from "@nsa/contracts";
const {Pool}=pg;
const app=Fastify({logger:true,bodyLimit:1_048_576,trustProxy:false});
const origins=(process.env.CORS_ORIGINS??"http://localhost:3000,http://localhost:8081").split(",").map(x=>x.trim()).filter(Boolean);
await app.register(cors,{origin:(origin,cb)=>{if(!origin||origins.includes(origin))return cb(null,true);return cb(new Error("Origin not allowed"),false);},methods:["GET","POST"],allowedHeaders:["content-type","authorization"]});
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000}):null;
app.get("/health",async(_req,reply)=>{if(!pool)return reply.code(503).send({status:"degraded",database:"disconnected"});try{await pool.query("SELECT 1");return{status:"ok",database:"connected"};}catch{return reply.code(503).send({status:"degraded",database:"disconnected"});}});
app.get("/v1/incidents",async(request,reply)=>{
 const parsed=incidentQuerySchema.safeParse(request.query);
 if(!parsed.success)return reply.code(400).send({error:"INVALID_QUERY",details:parsed.error.flatten()});
 if(!pool)return reply.code(503).send({error:"SERVICE_UNAVAILABLE"});
 const {state,category,limit,cursor}=parsed.data;const params:unknown[]=[];const filters=["status = 'published'","deleted_at IS NULL"];
 if(state){params.push(state);filters.push(`state = $${params.length}`);}
 if(category){params.push(category);filters.push(`category = $${params.length}`);}
 if(cursor){params.push(cursor);filters.push(`(published_at,id) < (SELECT published_at,id FROM incidents WHERE id = $${params.length}::uuid)`);}
 params.push(limit+1);
 const result=await pool.query(`SELECT id,title,summary,category,state,locality,occurred_at,published_at,verification_status,source_count,public_source_url FROM incidents WHERE ${filters.join(" AND ")} ORDER BY published_at DESC,id DESC LIMIT $${params.length}`,params);
 const rows=result.rows.slice(0,limit).map(row=>({id:row.id,title:row.title,summary:row.summary,category:row.category,state:row.state,locality:row.locality,occurredAt:new Date(row.occurred_at).toISOString(),publishedAt:new Date(row.published_at).toISOString(),verificationStatus:row.verification_status,sourceCount:row.source_count,publicSourceUrl:row.public_source_url}));
 return incidentListResponseSchema.parse({data:rows,nextCursor:result.rows.length>limit?String(rows.at(-1)?.id??""):null});
});
app.setErrorHandler((error,_request,reply)=>{app.log.error({err:error},"request failed");return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});});
await app.listen({port:Number(process.env.API_PORT??4000),host:process.env.API_HOST??"0.0.0.0"});
const shutdown=async()=>{await app.close();await pool?.end();process.exit(0);};
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
