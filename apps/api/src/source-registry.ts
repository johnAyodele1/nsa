import {Router,type RequestHandler} from "express";
import type {Pool,PoolClient} from "pg";
import {z} from "zod";

const decisionSchema=z.object({
 decision:z.enum(["approve","reject"]),
 robotsAllowed:z.boolean(),
 termsReviewed:z.boolean(),
 reason:z.string().trim().min(10).max(1000)
}).strict();

export function createSourceRegistryRouter(pool:Pool|null,authenticate:RequestHandler,requireModerator:RequestHandler){
 const router=Router();
 router.use(authenticate,requireModerator);

 router.get("/",async(req,res,next)=>{
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  const status=z.enum(["pending","approved","rejected","suspended","all"]).default("pending").safeParse(req.query.status??"pending");
  if(!status.success)return res.status(400).json({error:"INVALID_STATUS"});
  try{
   const result=await pool.query(`SELECT id,publisher_name,display_name,canonical_url,feed_url,source_kind,terms_url,licence_name,attribution_text,is_official,polling_interval_seconds,retention_days,robots_checked_at,robots_allowed,terms_reviewed_at,approval_status,approved_at,created_at
    FROM source_registry
    WHERE ($1='all' OR approval_status=$1)
    ORDER BY CASE approval_status WHEN 'pending' THEN 0 WHEN 'suspended' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,is_official DESC,publisher_name ASC
    LIMIT 200`,[status.data]);
   const data=result.rows.map(row=>({
    id:row.id,publisherName:row.publisher_name,displayName:row.display_name,canonicalUrl:row.canonical_url,feedUrl:row.feed_url,
    sourceKind:row.source_kind,termsUrl:row.terms_url,licenceName:row.licence_name,attributionText:row.attribution_text,
    isOfficial:row.is_official,pollingIntervalSeconds:row.polling_interval_seconds,retentionDays:row.retention_days,
    robotsCheckedAt:row.robots_checked_at?new Date(row.robots_checked_at).toISOString():null,
    robotsAllowed:row.robots_allowed,termsReviewedAt:row.terms_reviewed_at?new Date(row.terms_reviewed_at).toISOString():null,
    approvalStatus:row.approval_status,approvedAt:row.approved_at?new Date(row.approved_at).toISOString():null,
    createdAt:new Date(row.created_at).toISOString()
   }));
   return res.status(200).json({data});
  }catch(error){return next(error);}
 });

 router.post("/:sourceId/decision",async(req,res,next)=>{
  const id=z.string().uuid().safeParse(req.params.sourceId);
  if(!id.success)return res.status(400).json({error:"INVALID_SOURCE_ID"});
  const parsed=decisionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"INVALID_DECISION",details:parsed.error.flatten()});
  const decision=parsed.data;
  if(decision.decision==="approve"&&(!decision.robotsAllowed||!decision.termsReviewed))
   return res.status(422).json({error:"ROBOTS_AND_TERMS_REVIEW_REQUIRED"});
  if(!pool)return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
  const moderator=res.locals.moderator as {id:string}|undefined;
  if(!moderator)return res.status(403).json({error:"FORBIDDEN"});
  let client:PoolClient|undefined;let transactionOpen=false;
  try{
   client=await pool.connect();await client.query("BEGIN");transactionOpen=true;
   const locked=await client.query("SELECT id,approval_status FROM source_registry WHERE id=$1 FOR UPDATE",[id.data]);
   if(!locked.rows[0]){
    await client.query("ROLLBACK");transactionOpen=false;
    return res.status(404).json({error:"SOURCE_NOT_FOUND"});
   }
   if(locked.rows[0].approval_status==="approved"&&decision.decision==="approve"){
    await client.query("ROLLBACK");transactionOpen=false;
    return res.status(409).json({error:"SOURCE_ALREADY_APPROVED"});
   }
   const approved=decision.decision==="approve";
   await client.query(`UPDATE source_registry SET
     robots_checked_at=now(),robots_allowed=$2,
     terms_reviewed_at=CASE WHEN $3 THEN now() ELSE NULL END,
     approval_status=$4,
     approved_by=CASE WHEN $4='approved' THEN $5 ELSE NULL END,
     approved_at=CASE WHEN $4='approved' THEN now() ELSE NULL END,
     updated_at=now()
    WHERE id=$1`,[id.data,decision.robotsAllowed,decision.termsReviewed,approved?"approved":"rejected",moderator.id]);
   await client.query(`INSERT INTO source_registry_audit(source_registry_id,actor_id,action,reason,robots_allowed,terms_reviewed)
    VALUES($1,$2,$3,$4,$5,$6)`,[id.data,moderator.id,approved?"approve":"reject",decision.reason,decision.robotsAllowed,decision.termsReviewed]);
   await client.query("COMMIT");transactionOpen=false;
   return res.status(200).json({data:{sourceId:id.data,approvalStatus:approved?"approved":"rejected"}});
  }catch(error){
   if(transactionOpen&&client){try{await client.query("ROLLBACK");}catch(rollbackError){console.error("Source moderation rollback failed",rollbackError);}}
   return next(error);
  }finally{client?.release();}
 });
 return router;
}
