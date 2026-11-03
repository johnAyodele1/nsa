import {createHash} from "node:crypto";
import type {Pool} from "pg";
import {parseJsonFeed,parseRssOrAtom,type FeedItem} from "./feed.js";
import {fetchPublicFeed} from "./http.js";
import {classifyFeedItem} from "./relevance.js";
type Source={id:string;publisher_name:string;display_name:string;feed_url:string;source_kind:"rss"|"atom"|"api";polling_interval_seconds:number;retention_days:number;last_etag:string|null;last_modified_at:string|null};
export type WorkerLogger={info:(message:string,meta?:Record<string,unknown>)=>void;warn:(message:string,meta?:Record<string,unknown>)=>void;error:(message:string,meta?:Record<string,unknown>)=>void};
const logger:WorkerLogger=console;
async function claimSource(pool:Pool):Promise<Source|null>{
 const result=await pool.query<Source>(`WITH candidate AS (
  SELECT id FROM source_registry WHERE approval_status='approved' AND robots_allowed IS TRUE AND robots_checked_at IS NOT NULL AND terms_reviewed_at IS NOT NULL
   AND COALESCE(next_poll_at,now())<=now() AND (poll_lease_until IS NULL OR poll_lease_until<now())
  ORDER BY COALESCE(next_poll_at,now()),id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE source_registry s SET poll_lease_until=now()+interval '2 minutes',next_poll_at=now()+make_interval(secs=>s.polling_interval_seconds)
 FROM candidate WHERE s.id=candidate.id
 RETURNING s.id,s.publisher_name,s.display_name,s.feed_url,s.source_kind,s.polling_interval_seconds,s.retention_days,s.last_etag,s.last_modified_at`);
 return result.rows[0]??null;
}
function contentHash(item:FeedItem):string{return createHash("sha256").update(item.url+"\n"+item.title+"\n"+(item.publishedAt??"")).digest("hex");}
export async function ingestOneSource(pool:Pool,source:Source,log:WorkerLogger=logger):Promise<number>{
 try{
  const fetched=await fetchPublicFeed(source.feed_url,{etag:source.last_etag,lastModified:source.last_modified_at});
  if(fetched.status===304){await pool.query("UPDATE source_registry SET last_checked_at=now(),last_etag=$2,last_modified_at=$3,poll_lease_until=NULL,consecutive_failures=0,last_error=NULL WHERE id=$1",[source.id,fetched.etag,fetched.lastModified]);return 0;}
  const items=source.source_kind==="rss"?parseRssOrAtom(fetched.body,"rss"):source.source_kind==="atom"?parseRssOrAtom(fetched.body,"atom"):parseJsonFeed(fetched.body);
  let inserted=0;let excluded=0;
  for(const item of items){
   const classification=classifyFeedItem(item);
   if(!classification){excluded++;continue;}
   const result=await pool.query(`INSERT INTO source_ingestion_items(source_registry_id,external_id,source_url,title,summary,source_published_at,content_hash,retention_until,incident_category,priority,relevance_score,matched_terms,detected_state,classification_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,now()+make_interval(days=>$8),$9,$10,$11,$12,$13,$14)
    ON CONFLICT(source_registry_id,external_id) DO NOTHING`,[source.id,item.externalId,item.url,item.title,item.summary,item.publishedAt,contentHash(item),source.retention_days,classification.category,classification.priority,classification.relevanceScore,classification.matchedTerms,classification.detectedState,classification.classificationReason]);
   inserted+=result.rowCount??0;
  }
  await pool.query("UPDATE source_registry SET last_checked_at=now(),last_etag=$2,last_modified_at=$3,poll_lease_until=NULL,consecutive_failures=0,last_error=NULL WHERE id=$1",[source.id,fetched.etag,fetched.lastModified]);
  log.info("Ingestion source checked",{sourceId:source.id,itemsSeen:items.length,itemsAdded:inserted,itemsExcluded:excluded});
  return inserted;
 }catch(error){
  const code=error instanceof Error&&/^[A-Z0-9_]{3,80}$/.test(error.message)?error.message:"FEED_PROCESSING_FAILED";
  await pool.query(`UPDATE source_registry SET consecutive_failures=LEAST(consecutive_failures+1,12),
   next_poll_at=now()+make_interval(secs=>LEAST(86400, GREATEST(polling_interval_seconds, 300) * power(2,LEAST(consecutive_failures,8))::integer)),
   poll_lease_until=NULL,last_error=$2 WHERE id=$1`,[source.id,code]);
  const safeMessage=error instanceof Error?error.message.replace(/https?:\\/\\/[^\\s]+/gi,"[url]").replace(/[^a-zA-Z0-9 _.:/-]/g," ").slice(0,160):"Unknown ingestion error";
  log.warn("Ingestion source failed",{sourceId:source.id,errorCode:code,errorName:error instanceof Error?error.name:"UnknownError",errorMessage:safeMessage});
  return 0;
 }
}
export async function runIngestionCycle(pool:Pool,log:WorkerLogger=logger):Promise<number>{
 await pool.query("SELECT expire_source_ingestion_items()");
 let processed=0;let inserted=0;
 while(processed<25){const source=await claimSource(pool);if(!source)break;inserted+=await ingestOneSource(pool,source,log);processed++;}
 return inserted;
}
