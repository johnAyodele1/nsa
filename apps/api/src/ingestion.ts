import {Router,type RequestHandler} from "express";
import type {Pool,PoolClient} from "pg";
import {z} from "zod";
import {ingestionModerationDecisionSchema,moderationQueueQuerySchema} from "@nsa/contracts";
export function createIngestionRouter(pool:Pool|null,authenticate:RequestHandler,requireModerator:RequestHandler){
 const router=Router();router.use(authenticate,requireModerator);
 router.get("/",async(req,res,next)=>{
  const parsed=moderationQueueQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:"INVALID_QUERY",details:parsed.error.flatten()});
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  try{
   const result=await pool.query(`SELECT i.id,i.title,i.summary,i.source_url,i.source_published_at,i.created_at,s.publisher_name,s.display_name,s.is_official,s.canonical_url,s.licence_name,s.attribution_text
    FROM source_ingestion_items i JOIN source_registry s ON s.id=i.source_registry_id
    WHERE i.status='pending_review' AND i.retention_until>now()
    ORDER BY i.created_at ASC,i.id ASC LIMIT $1`,[parsed.data.limit]);
   const data=result.rows.map(row=>({id:row.id,title:row.title,summary:row.summary,sourceUrl:row.source_url,sourcePublishedAt:row.source_published_at?new Date(row.source_published_at).toISOString():null,createdAt:new Date(row.created_at).toISOString(),publisherName:row.publisher_name,displayName:row.display_name,isOfficial:row.is_official,canonicalUrl:row.canonical_url,licenceName:row.licence_name,attributionText:row.attribution_text}));
   return res.status(200).json({data});
  }catch(error){return next(error);}
 });
 router.post("/:itemId/decision",async(req,res,next)=>{
  const itemId=z.string().uuid().safeParse(req.params.itemId);if(!itemId.success)return res.status(400).json({error:"INVALID_ITEM_ID"});
  const parsed=ingestionModerationDecisionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_DECISION",details:parsed.error.flatten()});
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  const moderator=res.locals.moderator as {id:string}|undefined;if(!moderator)return res.status(403).json({error:"FORBIDDEN"});
  const decision=parsed.data;if(decision.decision==="publish"&&!decision.sourceIngestionItemIds?.includes(itemId.data))return res.status(422).json({error:"LEAD_ITEM_MUST_BE_INCLUDED"});
  let client:PoolClient|undefined;let open=false;
  try{
   client=await pool.connect();await client.query("BEGIN");open=true;
   if(decision.decision==="reject"){
    const rejected=await client.query("UPDATE source_ingestion_items SET status='rejected',reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status='pending_review' RETURNING id",[itemId.data,moderator.id]);
    if(!rejected.rowCount){await client.query("ROLLBACK");open=false;return res.status(404).json({error:"PENDING_ITEM_NOT_FOUND"});}
    await client.query("INSERT INTO ingestion_moderation_audit(ingestion_item_id,actor_id,action,reason) VALUES($1,$2,'reject',$3)",[itemId.data,moderator.id,decision.reason]);
    await client.query("COMMIT");open=false;return res.status(200).json({data:{itemId:itemId.data,status:"rejected",incidentId:null}});
   }
   const ids=decision.sourceIngestionItemIds??[];
   const evidence=await client.query(`SELECT i.id,i.title,i.summary,i.source_url,i.source_published_at,i.source_registry_id,s.publisher_name,s.display_name,s.canonical_url,s.is_official
    FROM source_ingestion_items i JOIN source_registry s ON s.id=i.source_registry_id
    WHERE i.id=ANY($1::uuid[]) AND i.status='pending_review' AND i.retention_until>now()
      AND s.approval_status='approved' AND s.robots_allowed IS TRUE AND s.terms_reviewed_at IS NOT NULL
    FOR UPDATE OF i`,[ids]);
   if(evidence.rows.length!==ids.length){await client.query("ROLLBACK");open=false;return res.status(422).json({error:"SOURCE_ITEM_NOT_PENDING_OR_APPROVED"});}
   const byId=new Map(evidence.rows.map(row=>[row.id,row]));const lead=byId.get(itemId.data);if(!lead)throw new Error("Lead source item missing after validation");
   for(const row of evidence.rows){if(new URL(row.source_url).origin!==new URL(row.canonical_url).origin){await client.query("ROLLBACK");open=false;return res.status(422).json({error:"SOURCE_ORIGIN_MISMATCH"});}}
   const publishers=new Set(evidence.rows.map(row=>row.publisher_name));
   if(decision.verificationStatus==="corroborated"&&publishers.size<2){await client.query("ROLLBACK");open=false;return res.status(422).json({error:"INSUFFICIENT_INDEPENDENT_PUBLISHERS"});}
   if(decision.verificationStatus==="officially_confirmed"&&!evidence.rows.some(row=>row.is_official)){await client.query("ROLLBACK");open=false;return res.status(422).json({error:"OFFICIAL_SOURCE_REQUIRED"});}
   const incident=await client.query(`INSERT INTO incidents(title,summary,category,state,locality,occurred_at,published_at,verification_status,status,source_count,public_source_url,reviewed_by,reviewed_at)
    VALUES($1,$2,$3,$4,$5,$6,now(),$7,'published',$8,$9,$10,now()) RETURNING id`,
    [lead.title,lead.summary,decision.category,decision.state,decision.locality??null,decision.occurredAt,decision.verificationStatus,evidence.rows.length,lead.source_url,moderator.id]);
   const incidentId=incident.rows[0]?.id as string|undefined;if(!incidentId)throw new Error("Published incident insert returned no ID");
   for(const row of evidence.rows){
    await client.query("INSERT INTO incident_sources(incident_id,source_registry_id,source_name,source_url,rights_review_status) VALUES($1,$2,$3,$4,'approved')",[incidentId,row.source_registry_id,row.display_name,row.source_url]);
    await client.query("UPDATE source_ingestion_items SET status='approved',incident_id=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1",[row.id,incidentId,moderator.id]);
    await client.query("INSERT INTO ingestion_moderation_audit(ingestion_item_id,actor_id,action,reason) VALUES($1,$2,'publish',$3)",[row.id,moderator.id,decision.reason+" Rights review: "+decision.rightsReviewNote]);
   }
   await client.query("INSERT INTO moderation_audit(incident_id,actor_id,action,reason) VALUES($1,$2,'approve',$3)",[incidentId,moderator.id,decision.reason]);
   await client.query("COMMIT");open=false;return res.status(201).json({data:{itemId:itemId.data,status:"published",incidentId,sourceCount:evidence.rows.length}});
  }catch(error){if(open&&client){try{await client.query("ROLLBACK");}catch(rollbackError){console.error("Ingestion moderation rollback failed",rollbackError);}}return next(error);}
  finally{client?.release();}
 });
 return router;
}
