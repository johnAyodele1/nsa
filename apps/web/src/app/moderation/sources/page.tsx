"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useNsaAuth} from "../../providers";
import {apiFetch} from "../../../lib/api";

type Source={
 id:string;publisherName:string;displayName:string;canonicalUrl:string;feedUrl:string;sourceKind:"rss"|"atom"|"api";
 termsUrl:string|null;licenceName:string|null;attributionText:string|null;isOfficial:boolean;
 robotsAllowed:boolean|null;robotsCheckedAt:string|null;termsReviewedAt:string|null;
 approvalStatus:"pending"|"approved"|"suspended"|"rejected";approvedAt:string|null;createdAt:string;
};
type Filter="pending"|"all"|"approved"|"suspended"|"rejected";
const filters:Filter[]=["pending","all","approved","suspended","rejected"];
const favicon=(url:string)=>"https://www.google.com/s2/favicons?domain_url="+encodeURIComponent(url)+"&sz=128";
export default function SourceRegistryPage(){
 const auth=useNsaAuth();
 const [sources,setSources]=useState<Source[]>([]);
 const [filter,setFilter]=useState<Filter>("pending");
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState<string|null>(null);
 const [reason,setReason]=useState<Record<string,string>>({});
 const [robots,setRobots]=useState<Record<string,boolean>>({});
 const [terms,setTerms]=useState<Record<string,boolean>>({});
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await apiFetch("v1/moderation/source-registry");
   if(response.status===401||response.status===403)throw new Error("This account is not authorized to manage sources.");
   if(!response.ok)throw new Error("Could not load the source registry.");
   const body=await response.json() as {data:Source[]};setSources(body.data);
  }catch(e){setError(e instanceof Error?e.message:"Could not load source registry.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{if(auth.authenticated)void load();else setSources([]);},[auth.authenticated,load]);
 const visible=useMemo(()=>sources.filter(source=>filter==="all"||source.approvalStatus===filter),[sources,filter]);
 const counts=useMemo(()=>({pending:sources.filter(s=>s.approvalStatus==="pending").length,approved:sources.filter(s=>s.approvalStatus==="approved").length,suspended:sources.filter(s=>s.approvalStatus==="suspended").length,rejected:sources.filter(s=>s.approvalStatus==="rejected").length}),[sources]);
 async function decide(source:Source,decision:"approve"|"reject"|"suspend"){
  const note=(reason[source.id]??"").trim();
  if(note.length<10){setError("Add a review note of at least 10 characters.");return;}
  if(decision==="approve"&&(!robots[source.id]||!terms[source.id])){setError("Confirm both the publisher's robots policy and terms of use before approval.");return;}
  setSaving(source.id);setError("");setNotice("");
  try{
   const response=await apiFetch("v1/moderation/source-registry/"+source.id+"/decision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,reason:note,...(decision==="approve"?{robotsAllowed:true,termsReviewed:true}:{})})});
   const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error??"Source decision failed.");
   setNotice(source.displayName+" "+(decision==="approve"?"approved for ingestion":decision==="reject"?"rejected":"suspended")+".");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Source decision failed.");}
  finally{setSaving(null);}
 }
 return <main className="mod-shell">
  <header className="mod-header"><Link className="brand" href="/"><span className="mark">N</span><span>NSA<small>NIGERIA SECURITY ALERTS</small></span></Link><nav className="source-nav"><Link className="mod-back" href="/moderation">Report moderation ↗</Link><Link className="mod-back" href="/moderation/ingestion">Ingestion triage ↗</Link></nav></header>
  <section className="mod-intro"><span className="eyebrow">PUBLISHER MANAGEMENT</span><h1>Source registry</h1><p>Review publishers before the ingestion worker is allowed to fetch their feeds. Approval requires checking the publisher's robots policy and terms of use. This does not approve individual incidents for publication.</p></section>
  {!auth.ready&&<p className="mod-notice">Checking your account…</p>}
  {auth.error&&<p className="mod-error" role="alert">{auth.error}</p>}
  {auth.ready&&!auth.configured&&<section className="mod-login"><h2>Authentication is not configured</h2><p>Configure the local API database and web session encryption settings.</p></section>}
  {auth.configured&&!auth.authenticated&&<section className="mod-login"><h2>Moderator access</h2><p>Sign in with an account that has moderator or administrator access.</p><button onClick={()=>void auth.signIn()}>Sign in with email</button></section>}
  {auth.authenticated&&<>
   <section className="source-summary">
    <div><strong>{counts.pending}</strong><span>Pending review</span></div><div><strong>{counts.approved}</strong><span>Approved</span></div><div><strong>{counts.suspended}</strong><span>Suspended</span></div><div><strong>{counts.rejected}</strong><span>Rejected</span></div>
   </section>
   <section className="mod-queue">
    <div className="mod-queue-head"><div><span className="eyebrow">SOURCE APPROVAL</span><h2>{visible.length} publishers</h2></div><button className="mod-secondary" onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh registry"}</button></div>
    <div className="source-filters">{filters.map(value=><button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{value==="all"?"All":value.replace(/^[a-z]/,c=>c.toUpperCase())}</button>)}</div>
    {visible.length===0&&!loading&&<div className="mod-empty"><h3>{filter==="pending"?"No publishers awaiting approval":"No publishers in this view"}</h3><p>Refresh the registry to check for newly seeded or added sources.</p></div>}
    {visible.map(source=><article className="source-card" key={source.id}>
     <div className="source-card-head">
      <div className="source-identity"><img src={favicon(source.canonicalUrl)} alt="" width="48" height="48" loading="lazy" onError={event=>{event.currentTarget.style.visibility="hidden";}}/><div><span className="source-publisher">{source.publisherName}</span><h3>{source.displayName}</h3><a href={source.canonicalUrl} target="_blank" rel="noreferrer">{new URL(source.canonicalUrl).hostname} ↗</a></div></div>
      <span className={"source-status status-"+source.approvalStatus}>{source.approvalStatus.replace("_"," ")}</span>
     </div>
     <div className="source-details">
      <div><span>Feed endpoint</span><a href={source.feedUrl} target="_blank" rel="noreferrer">{source.feedUrl}</a></div>
      <div><span>Terms / usage policy</span>{source.termsUrl?<a href={source.termsUrl} target="_blank" rel="noreferrer">Review publisher terms ↗</a>:<b className="source-missing">No terms URL supplied</b>}</div>
      <div><span>Feed type</span><b>{source.sourceKind.toUpperCase()}</b></div>
      <div><span>Publisher type</span><b>{source.isOfficial?"Official agency":"News / public source"}</b></div>
     </div>
     {source.attributionText&&<p className="source-attribution">{source.attributionText}</p>}
     {(source.approvalStatus==="pending"||source.approvalStatus==="suspended")&&<div className="source-review">
      <label className="source-attest"><input type="checkbox" checked={Boolean(robots[source.id])} onChange={event=>setRobots(current=>({...current,[source.id]:event.target.checked}))}/><span>I checked the publisher's robots.txt and confirmed automated feed access is allowed.</span></label>
      <label className="source-attest"><input type="checkbox" checked={Boolean(terms[source.id])} onChange={event=>setTerms(current=>({...current,[source.id]:event.target.checked}))}/><span>I reviewed the linked terms / usage policy and confirmed this limited metadata ingestion is permitted.</span></label>
     </div>}
     <label className="mod-field">Review notes<textarea rows={2} maxLength={1000} value={reason[source.id]??""} onChange={event=>setReason(current=>({...current,[source.id]:event.target.value}))} placeholder="Record the terms / robots review and any restrictions. At least 10 characters."/></label>
     <div className="source-actions">
      {source.approvalStatus!=="approved"&&source.approvalStatus!=="rejected"&&<button className="mod-approve" disabled={saving===source.id||!source.termsUrl||!robots[source.id]||!terms[source.id]} onClick={()=>void decide(source,"approve")}>{saving===source.id?"Saving…":"Approve source"}</button>}
      {source.approvalStatus!=="rejected"&&<button className="mod-reject" disabled={saving===source.id} onClick={()=>void decide(source,source.approvalStatus==="suspended"?"reject":"suspend")}>{source.approvalStatus==="suspended"?"Reject source":"Suspend source"}</button>}
      {source.approvalStatus==="rejected"&&<span className="mod-muted">Rejected sources remain in the audit history and cannot be polled.</span>}
     </div>
    </article>)}
   </section>
   <div className="source-safety-note">Approval enables feed polling only. Every matched article still enters the separate ingestion review queue. Publishing an incident remains a separate moderator decision.</div>
  </>}
  {error&&<p className="mod-error" role="alert">{error}</p>}{notice&&<p className="mod-notice" role="status">{notice}</p>}
  <footer className="mod-foot">Source approvals and decisions are recorded in the source registry moderation audit table. Only approved sources with completed policy checks are eligible for ingestion.</footer>
 </main>;
}
