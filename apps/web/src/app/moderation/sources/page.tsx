"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useNsaAuth} from "../../providers";
import {apiFetch} from "../../../lib/api";

type Source={
 id:string;publisherName:string;displayName:string;canonicalUrl:string;feedUrl:string;sourceKind:string;
 termsUrl:string|null;licenceName:string|null;attributionText:string|null;isOfficial:boolean;
 pollingIntervalSeconds:number;retentionDays:number;robotsCheckedAt:string|null;robotsAllowed:boolean|null;
 termsReviewedAt:string|null;approvalStatus:"pending"|"approved"|"rejected"|"suspended";
 approvedAt:string|null;createdAt:string;
};
type Review={robotsAllowed:boolean;termsReviewed:boolean;reason:string};
const emptyReview:Review={robotsAllowed:false,termsReviewed:false,reason:""};

export default function SourceRegistryPage(){
 const auth=useNsaAuth();
 const [items,setItems]=useState<Source[]>([]);
 const [status,setStatus]=useState("pending");
 const [reviews,setReviews]=useState<Record<string,Review>>({});
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await apiFetch("v1/moderation/source-registry?status="+status);
   if(response.status===401||response.status===403)throw new Error("Moderator access is required to manage sources.");
   const body=await response.json() as {data?:Source[];error?:string};
   if(!response.ok)throw new Error(body.error??"Could not load source registry.");
   setItems(body.data??[]);
   setReviews(current=>{const next={...current};for(const item of body.data??[])if(!next[item.id])next[item.id]=emptyReview;return next;});
  }catch(e){setError(e instanceof Error?e.message:"Could not load sources.");}
  finally{setLoading(false);}
 },[status]);
 useEffect(()=>{if(auth.authenticated)void load();else setItems([]);},[auth.authenticated,load]);

 function update(id:string,patch:Partial<Review>){
  setReviews(current=>({...current,[id]:{...emptyReview,...current[id],...patch}}));
 }
 async function decide(item:Source,decision:"approve"|"reject"){
  const review=reviews[item.id]??emptyReview;
  if(review.reason.trim().length<10){setError("Enter a review reason of at least 10 characters.");return;}
  if(decision==="approve"&&(!review.robotsAllowed||!review.termsReviewed)){setError("Approval requires both robots.txt and terms-of-use checks.");return;}
  setSaving(item.id);setError("");setNotice("");
  try{
   const response=await apiFetch("v1/moderation/source-registry/"+item.id+"/decision",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({decision,robotsAllowed:review.robotsAllowed,termsReviewed:review.termsReviewed,reason:review.reason.trim()})
   });
   const body=await response.json() as {error?:string};
   if(!response.ok)throw new Error(body.error??"Source decision could not be saved.");
   setNotice(item.publisherName+" "+(decision==="approve"?"approved for ingestion.":"rejected."));
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Could not save source decision.");}
  finally{setSaving(null);}
 }

 return <main className="mod-shell">
  <header className="mod-header">
   <Link className="brand" href="/"><span className="mark">N</span><span>NSA<small>NIGERIA SECURITY ALERTS</small></span></Link>
   <nav className="mod-nav"><Link className="mod-back" href="/moderation">Report moderation ↗</Link><Link className="mod-back" href="/moderation/ingestion">Incident triage ↗</Link></nav>
  </header>
  <section className="mod-intro">
   <span className="eyebrow">SOURCE REGISTRY</span><h1>Source management</h1>
   <p>Review each publisher before its feed can be polled. Approval requires a manual robots.txt check and a terms-of-use review. A source being listed here does not mean its feed is authorised for ingestion.</p>
  </section>
  {!auth.ready&&<p className="mod-notice">Checking account…</p>}
  {auth.ready&&!auth.authenticated&&<section className="mod-login"><h2>Moderator access</h2><p>Sign in with a moderator or administrator account.</p><button onClick={()=>auth.signIn()}>Sign in</button></section>}
  {auth.authenticated&&<>
   <section className="mod-queue">
    <div className="mod-queue-head">
     <div><span className="eyebrow">PUBLISHER CATALOGUE</span><h2>{items.length} sources</h2></div>
     <div className="mod-actions">
      <select aria-label="Filter sources" value={status} onChange={e=>setStatus(e.target.value)}>
       <option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option><option value="all">All sources</option>
      </select>
      <button className="mod-secondary" onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh"}</button>
     </div>
    </div>
    {loading&&<p className="mod-muted">Loading source registry…</p>}
    {!loading&&items.length===0&&<div className="mod-empty"><h3>No sources in this view</h3><p>Choose another status filter or refresh.</p></div>}
    {items.map(item=>{
     const review=reviews[item.id]??emptyReview;
     const robotsUrl=new URL("/robots.txt",item.canonicalUrl).toString();
     return <article className="mod-report" key={item.id}>
      <div className="mod-report-meta"><span>{item.approvalStatus}</span><span>{item.sourceKind.toUpperCase()}</span><span>{item.isOfficial?"Official source":"Publisher"}</span><span>Poll every {Math.round(item.pollingIntervalSeconds/60)} min</span></div>
      <h3>{item.displayName}</h3><p className="mod-muted">Publisher: {item.publisherName} · Retention: {item.retentionDays} days</p>
      <div className="source-links"><a href={item.canonicalUrl} target="_blank" rel="noreferrer">Publisher website ↗</a><a href={item.feedUrl} target="_blank" rel="noreferrer">Feed URL ↗</a><a href={robotsUrl} target="_blank" rel="noreferrer">robots.txt ↗</a>{item.termsUrl&&<a href={item.termsUrl} target="_blank" rel="noreferrer">Terms of use ↗</a>}</div>
      <p className="mod-muted">Licence: {item.licenceName??"Not specified"}<br/>Attribution: {item.attributionText??"No attribution guidance supplied"}</p>
      <p className="mod-muted">Robots check: {item.robotsCheckedAt?new Date(item.robotsCheckedAt).toLocaleString("en-NG"):"Not reviewed"} · Terms review: {item.termsReviewedAt?new Date(item.termsReviewedAt).toLocaleString("en-NG"):"Not reviewed"}</p>
      {item.approvalStatus!=="approved"&&<>
       <div className="source-review-checks">
        <label className="mod-check"><input type="checkbox" checked={review.robotsAllowed} onChange={e=>update(item.id,{robotsAllowed:e.target.checked})}/><span>robots.txt permits this feed path<small>Open robots.txt above and verify the feed URL path is not disallowed.</small></span></label>
        <label className="mod-check"><input type="checkbox" checked={review.termsReviewed} onChange={e=>update(item.id,{termsReviewed:e.target.checked})}/><span>Terms of use reviewed<small>Confirm the feed's use, attribution and retention are permitted. Do not assume public access grants republication rights.</small></span></label>
       </div>
       <label className="mod-field">Review notes / decision reason<textarea rows={3} maxLength={1000} value={review.reason} onChange={e=>update(item.id,{reason:e.target.value})} placeholder="Record the robots.txt result, terms page reviewed, permitted use and any restrictions (minimum 10 characters)."/></label>
       <div className="mod-decision-buttons">
        <button className="mod-reject" disabled={saving===item.id||review.reason.trim().length<10} onClick={()=>void decide(item,"reject")}>Reject source</button>
        <button className="mod-approve" disabled={saving===item.id||!review.robotsAllowed||!review.termsReviewed||review.reason.trim().length<10} onClick={()=>void decide(item,"approve")}>{saving===item.id?"Saving…":"Approve for ingestion"}</button>
       </div>
      </>}
      {item.approvalStatus==="approved"&&<p className="mod-notice">Approved {item.approvedAt?new Date(item.approvedAt).toLocaleString("en-NG"):""} · Worker may poll this feed when its next poll is due.</p>}
     </article>;
    })}
   </section>
  </>}
  {error&&<p className="mod-error" role="alert">{error}</p>}{notice&&<p className="mod-notice" role="status">{notice}</p>}
  <footer className="mod-foot">Approval is a human review record, not legal advice or an automated robots.txt interpretation. Recheck publisher policies when they change. The worker only polls approved sources that have a recorded positive robots and terms review.</footer>
 </main>;
}
