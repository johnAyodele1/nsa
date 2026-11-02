import express,{type ErrorRequestHandler,type RequestHandler} from "express";
import cors from "cors";
import helmet from "helmet";
import {rateLimit} from "express-rate-limit";
import type {Pool,PoolClient} from "pg";
import {z} from "zod";
import {createIngestionRouter} from "./ingestion.js";
import {createLiveRouter,type AgoraConfig} from "./live.js";
import {createPrivacyRouter} from "./privacy.js";
import {createHash,randomUUID} from "node:crypto";
import {incidentListResponseSchema,incidentQuerySchema,reportSubmissionSchema,reportSubmissionResponseSchema,reportModerationDecisionSchema,moderationQueueQuerySchema,reportListQuerySchema,reportListResponseSchema,moderationSourceListResponseSchema,agencyDirectoryResponseSchema} from "@nsa/contracts";
const cursorPayloadSchema=z.object({publishedAt:z.string().datetime(),id:z.string().uuid()}).strict();
type Dependencies={pool:Pool|null;allowedOrigins:string[];authMiddleware?:RequestHandler|undefined;agoraConfig?:AgoraConfig};
const encodeCursor=(payload:{publishedAt:string;id:string})=>Buffer.from(JSON.stringify(payload)).toString("base64url");
function decodeCursor(value:string){try{const parsed=cursorPayloadSchema.safeParse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));return parsed.success?parsed.data:null;}catch{return null;}}
const authNotConfigured:RequestHandler=(_req,res)=>res.status(503).json({error:"AUTH_NOT_CONFIGURED"});
function requireModerator(pool:Pool|null):RequestHandler{
 return async(_req,res,next)=>{
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  const auth=res.locals.auth;if(!auth?.subject)return res.status(401).json({error:"UNAUTHORIZED"});
  try{const result=await pool.query("SELECT id,role,is_active FROM app_users WHERE auth_subject=$1",[auth.subject]);const user=result.rows[0];if(!user?.is_active||!["moderator","admin"].includes(user.role))return res.status(403).json({error:"FORBIDDEN"});res.locals.moderator={id:user.id,role:user.role};return next();}
  catch(error){return next(error);}
 };
}
export function createApp({pool,allowedOrigins,authMiddleware,agoraConfig}:Dependencies){
 const app=express();app.disable("x-powered-by");app.disable("etag");
 app.use((req,res,next)=>{
  const requestId=randomUUID();const startedAt=process.hrtime.bigint();
  res.locals.requestId=requestId;res.setHeader("x-request-id",requestId);
  res.on("finish",()=>{
   const durationMs=Number(process.hrtime.bigint()-startedAt)/1_000_000;
   console.info(JSON.stringify({level:"info",event:"http_request",requestId,method:req.method,path:req.path,statusCode:res.statusCode,durationMs:Math.round(durationMs*100)/100}));
  });
  next();
 });
 app.use(helmet());
 app.use(cors({origin(origin,callback){if(!origin||allowedOrigins.includes(origin))return callback(null,true);return callback(null,false);},methods:["GET","POST"],allowedHeaders:["Content-Type","Authorization"],maxAge:600}));
 app.use(express.json({limit:"64kb",strict:true}));
 app.use("/v1",rateLimit({windowMs:60000,limit:120,standardHeaders:"draft-8",legacyHeaders:false,message:{error:"RATE_LIMITED"}}));
 app.get("/health/live",(_req,res)=>res.status(200).json({status:"ok"}));
 app.get("/health/ready",async(_req,res)=>{if(!pool)return res.status(503).json({status:"not_ready",database:"not_configured"});try{await pool.query("SELECT 1");return res.status(200).json({status:"ready",database:"connected"});}catch{return res.status(503).json({status:"not_ready",database:"unavailable"});}});
 const authenticate=authMiddleware??authNotConfigured;
 app.use("/v1/moderation/ingestion-items",createIngestionRouter(pool,authenticate,requireModerator(pool)));
 app.use("/v1/live-sessions",createLiveRouter(pool,authenticate,requireModerator(pool),agoraConfig??null));
 app.use("/v1",createPrivacyRouter(pool,authenticate,requireModerator(pool)));
 app.post("/v1/reports",authenticate,async(req,res,next)=>{
  const parsed=reportSubmissionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_REPORT",details:parsed.error.flatten()});if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  const auth=res.locals.auth;if(!auth?.subject)return res.status(401).json({error:"UNAUTHORIZED"});
  let client:PoolClient|undefined;let transactionOpen=false;
  try{
   client=await pool.connect();await client.query("BEGIN");transactionOpen=true;
   const subjectHash=createHash("sha256").update(auth.subject).digest("hex");const erased=await client.query("SELECT 1 FROM erased_auth_subjects WHERE subject_hash=$1",[subjectHash]);if(erased.rowCount){await client.query("ROLLBACK");transactionOpen=false;return res.status(403).json({error:"ACCOUNT_DISABLED"});}
   const userResult=await client.query("INSERT INTO app_users(auth_subject) VALUES($1) ON CONFLICT(auth_subject) DO UPDATE SET last_seen_at=now() RETURNING id,is_active",[auth.subject]);const user=userResult.rows[0];
   if(!user?.is_active){await client.query("ROLLBACK");transactionOpen=false;return res.status(403).json({error:"ACCOUNT_DISABLED"});}
   await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",[auth.subject]);
   const countResult=await client.query("SELECT count(*)::int AS count FROM incident_reports WHERE reporter_id=$1 AND created_at>now()-interval '1 hour'",[user.id]);
   if(Number(countResult.rows[0]?.count??0)>=5){await client.query("ROLLBACK");transactionOpen=false;return res.status(429).json({error:"REPORT_LIMIT_REACHED"});}
   const reportResult=await client.query("INSERT INTO incident_reports(reporter_id,title,summary,category,state,locality,occurred_at,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,created_at",[user.id,parsed.data.title,parsed.data.summary,parsed.data.category,parsed.data.state,parsed.data.locality??null,parsed.data.occurredAt,parsed.data.sourceUrl??null]);
   const report=reportResult.rows[0];if(!report)throw new Error("Report insert returned no record");
   await client.query("COMMIT");transactionOpen=false;
   return res.status(202).json(reportSubmissionResponseSchema.parse({data:{id:report.id,status:report.status,createdAt:new Date(report.created_at).toISOString()}}));
  }catch(error){if(transactionOpen&&client){try{await client.query("ROLLBACK");}catch(rollbackError){console.error("Report transaction rollback failed",rollbackError);}}return next(error);}
  finally{client?.release();}
 });
 app.get("/v1/reports/mine",authenticate,async(req,res,next)=>{
  const parsed=reportListQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:"INVALID_QUERY",details:parsed.error.flatten()});if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  const auth=res.locals.auth;if(!auth?.subject)return res.status(401).json({error:"UNAUTHORIZED"});
  try{const result=await pool.query("SELECT r.id,r.title,r.status,r.created_at,r.reviewed_at,r.incident_id FROM incident_reports r JOIN app_users u ON u.id=r.reporter_id WHERE u.auth_subject=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT $2",[auth.subject,parsed.data.limit]);const data=result.rows.map(row=>({id:row.id,title:row.title,status:row.status,createdAt:new Date(row.created_at).toISOString(),reviewedAt:row.reviewed_at?new Date(row.reviewed_at).toISOString():null,incidentId:row.incident_id}));return res.status(200).json(reportListResponseSchema.parse({data}));}
  catch(error){return next(error);}
 });
 app.get("/v1/moderation/reports",authenticate,requireModerator(pool),async(req,res,next)=>{
  const parsed=moderationQueueQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:"INVALID_QUERY",details:parsed.error.flatten()});if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  try{const result=await pool.query("SELECT id,title,summary,category,state,locality,occurred_at,source_url,created_at FROM incident_reports WHERE status='pending_review' ORDER BY created_at ASC,id ASC LIMIT $1",[parsed.data.limit]);const data=result.rows.map(row=>({id:row.id,title:row.title,summary:row.summary,category:row.category,state:row.state,locality:row.locality,occurredAt:new Date(row.occurred_at).toISOString(),sourceUrl:row.source_url,createdAt:new Date(row.created_at).toISOString()}));return res.status(200).json({data});}
  catch(error){return next(error);}
 });
 app.get("/v1/moderation/sources",authenticate,requireModerator(pool),async(_req,res,next)=>{
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  try{
   const result=await pool.query("SELECT id,publisher_name,display_name,canonical_url,is_official FROM source_registry WHERE approval_status='approved' AND robots_allowed IS TRUE AND robots_checked_at IS NOT NULL AND terms_reviewed_at IS NOT NULL ORDER BY is_official DESC,publisher_name ASC LIMIT 100");
   const data=result.rows.map(row=>({id:row.id,publisherName:row.publisher_name,displayName:row.display_name,canonicalUrl:row.canonical_url,isOfficial:row.is_official}));
   return res.status(200).json(moderationSourceListResponseSchema.parse({data}));
  }catch(error){return next(error);}
 });
 app.post("/v1/moderation/reports/:reportId/decision",authenticate,requireModerator(pool),async(req,res,next)=>{
  const id=z.string().uuid().safeParse(req.params.reportId);if(!id.success)return res.status(400).json({error:"INVALID_REPORT_ID"});
  const parsed=reportModerationDecisionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_DECISION",details:parsed.error.flatten()});
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});const moderator=res.locals.moderator;if(!moderator)return res.status(403).json({error:"FORBIDDEN"});
  let client:PoolClient|undefined;let transactionOpen=false;
  try{
   client=await pool.connect();await client.query("BEGIN");transactionOpen=true;
   const reportResult=await client.query("SELECT id,title,summary,category,state,locality,occurred_at,status FROM incident_reports WHERE id=$1 FOR UPDATE",[id.data]);const report=reportResult.rows[0];
   if(!report){await client.query("ROLLBACK");transactionOpen=false;return res.status(404).json({error:"REPORT_NOT_FOUND"});}
   if(report.status!=="pending_review"){await client.query("ROLLBACK");transactionOpen=false;return res.status(409).json({error:"REPORT_ALREADY_REVIEWED"});}
   if(parsed.data.decision==="reject"){
    await client.query("UPDATE incident_reports SET status='rejected',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1",[id.data,moderator.id]);
    await client.query("INSERT INTO report_moderation_audit(report_id,actor_id,action,reason) VALUES($1,$2,'reject',$3)",[id.data,moderator.id,parsed.data.reason]);
    await client.query("COMMIT");transactionOpen=false;return res.status(200).json({data:{reportId:id.data,status:"rejected",incidentId:null}});
   }
   const verificationStatus=parsed.data.verificationStatus;if(!verificationStatus){await client.query("ROLLBACK");transactionOpen=false;return res.status(400).json({error:"VERIFICATION_STATUS_REQUIRED"});}
   const evidence=parsed.data.sources??[];const sourceIds=evidence.map(source=>source.sourceRegistryId);
   const sourceResult=await client.query("SELECT id,publisher_name,display_name,canonical_url,is_official FROM source_registry WHERE id=ANY($1::uuid[]) AND approval_status='approved' AND robots_allowed IS TRUE AND terms_reviewed_at IS NOT NULL FOR SHARE",[sourceIds]);
   if(sourceResult.rows.length!==evidence.length){await client.query("ROLLBACK");transactionOpen=false;return res.status(422).json({error:"SOURCE_NOT_APPROVED"});}
   const sourcesById=new Map(sourceResult.rows.map(source=>[source.id,source]));
   for(const item of evidence){const source=sourcesById.get(item.sourceRegistryId);if(!source||new URL(item.sourceUrl).origin!==new URL(source.canonical_url).origin){await client.query("ROLLBACK");transactionOpen=false;return res.status(422).json({error:"SOURCE_ORIGIN_MISMATCH"});}}
   if(verificationStatus==="corroborated"&&new Set(sourceResult.rows.map(source=>source.publisher_name)).size<2){await client.query("ROLLBACK");transactionOpen=false;return res.status(422).json({error:"INSUFFICIENT_INDEPENDENT_SOURCES"});}
   if(verificationStatus==="officially_confirmed"&&!sourceResult.rows.some(source=>source.is_official)){await client.query("ROLLBACK");transactionOpen=false;return res.status(422).json({error:"OFFICIAL_SOURCE_REQUIRED"});}
   const firstEvidence=evidence[0];if(!firstEvidence)throw new Error("Approval evidence unexpectedly empty");
   const incidentResult=await client.query("INSERT INTO incidents(title,summary,category,state,locality,occurred_at,published_at,verification_status,status,source_count,public_source_url,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,now(),$7,'published',$8,$9,$10,now()) RETURNING id",[report.title,report.summary,report.category,report.state,report.locality,report.occurred_at,verificationStatus,evidence.length,firstEvidence.sourceUrl,moderator.id]);
   const incident=incidentResult.rows[0];if(!incident)throw new Error("Incident insert returned no record");
   for(const item of evidence){const source=sourcesById.get(item.sourceRegistryId);if(!source)throw new Error("Approved source disappeared during moderation");await client.query("INSERT INTO incident_sources(incident_id,source_registry_id,source_name,source_url,rights_review_status) VALUES($1,$2,$3,$4,'pending')",[incident.id,source.id,source.display_name,item.sourceUrl]);}
   await client.query("UPDATE incident_reports SET status='approved',incident_id=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$1",[id.data,incident.id,moderator.id]);
   await client.query("INSERT INTO report_moderation_audit(report_id,actor_id,action,reason) VALUES($1,$2,'approve',$3)",[id.data,moderator.id,parsed.data.reason]);
   await client.query("COMMIT");transactionOpen=false;return res.status(200).json({data:{reportId:id.data,status:"approved",incidentId:incident.id}});
  }catch(error){if(transactionOpen&&client){try{await client.query("ROLLBACK");}catch(rollbackError){console.error("Moderation transaction rollback failed",rollbackError);}}return next(error);}
  finally{client?.release();}
 });
 app.get("/v1/agencies",async(_req,res,next)=>{
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  try{
   const result=await pool.query(`SELECT a.id,a.name,a.acronym,a.scope,a.description,a.official_website,a.source_url,a.source_verified_at,a.next_review_at,
    COALESCE(json_agg(json_build_object('id',c.id,'label',c.label,'phoneNumber',c.phone_number,'contactType',c.contact_type,'sourceUrl',c.source_url,'verifiedAt',c.verified_at) ORDER BY c.display_order) FILTER(WHERE c.id IS NOT NULL),'[]'::json) AS contacts
    FROM agency_directory a LEFT JOIN agency_contacts c ON c.agency_id=a.id AND c.is_active IS TRUE
    WHERE a.is_active IS TRUE GROUP BY a.id ORDER BY a.scope ASC,a.name ASC`);
   const data=result.rows.map(row=>({id:row.id,name:row.name,acronym:row.acronym,scope:row.scope,description:row.description,officialWebsite:row.official_website,sourceUrl:row.source_url,sourceVerifiedAt:new Date(row.source_verified_at).toISOString(),nextReviewAt:new Date(row.next_review_at).toISOString(),contacts:row.contacts.map((contact:{id:string;label:string;phoneNumber:string;contactType:string;sourceUrl:string;verifiedAt:string})=>({...contact,verifiedAt:new Date(contact.verifiedAt).toISOString()}))}));
   return res.status(200).json(agencyDirectoryResponseSchema.parse({data}));
  }catch(error){return next(error);}
 });
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
 const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{if(res.headersSent)return;if(error instanceof SyntaxError&&"body"in error){res.status(400).json({error:"INVALID_JSON"});return;}console.error(JSON.stringify({level:"error",event:"unhandled_api_error",requestId:res.locals.requestId??null,errorName:error instanceof Error?error.name:"UnknownError"}));res.status(500).json({error:"INTERNAL_SERVER_ERROR"});};app.use(errorHandler);return app;
}
