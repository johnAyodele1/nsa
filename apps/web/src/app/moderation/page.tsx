"use client";
import {useCallback,useMemo,useState} from "react";
import {moderationSourceListResponseSchema,moderationQueueResponseSchema,reportModerationDecisionSchema,type ModerationQueueItem,type ModerationSource,type VerificationStatus} from "@nsa/contracts";
const API=process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000";
type QueueItem=ModerationQueueItem;
type Source=ModerationSource;
type Verification=Exclude<VerificationStatus,"unverified">;
type DecisionState={reason:string;verification:Verification;selected:string[];urls:Record<string,string>};
export default function ModerationPage(){
 const [token,setToken]=useState("");const [authenticated,setAuthenticated]=useState(false);const [reports,setReports]=useState<QueueItem[]>([]);const [sources,setSources]=useState<Source[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");const [decisions,setDecisions]=useState<Record<string,DecisionState>>({});
 const authHeaders=useMemo(()=>({Authorization:`Bearer ${token.trim()}`}),[token]);
 const updateDecision=(id:string,patch:Partial<DecisionState>)=>setDecisions(current=>({...current,[id]:{reason:"",verification:"officially_confirmed",selected:[],urls:{},...current[id],...patch}}));
 const loadQueue=useCallback(async()=>{
  if(!token.trim())return;setLoading(true);setError("");setNotice("");
  try{const headers={Authorization:`Bearer ${token.trim()}`};const [queueResponse,sourceResponse]=await Promise.all([fetch(`${API}/v1/moderation/reports?limit=50`,{headers}),fetch(`${API}/v1/moderation/sources`,{headers})]);
   if([401,403].includes(queueResponse.status)||[401,403].includes(sourceResponse.status)){setAuthenticated(false);throw new Error("This token is not authorized to access the moderation console.");}
   if(!queueResponse.ok||!sourceResponse.ok)throw new Error("The moderation service is unavailable. Check the API and try again.");
   const queue=moderationQueueResponseSchema.parse(await queueResponse.json());const sourceData=moderationSourceListResponseSchema.parse(await sourceResponse.json());setReports(queue.data);setSources(sourceData.data);setAuthenticated(true);
  }catch(e){setError(e instanceof Error?e.message:"Could not load the moderation queue.");}finally{setLoading(false);}
 },[token]);
 async function decide(report:QueueItem,decision:"approve"|"reject"){
  const state=decisions[report.id]??{reason:"",verification:"officially_confirmed" as Verification,selected:[],urls:{}};
  const payload=decision==="reject"?{decision,reason:state.reason}:{decision,reason:state.reason,verificationStatus:state.verification,sources:state.selected.map(sourceRegistryId=>({sourceRegistryId,sourceUrl:state.urls[sourceRegistryId]??sources.find(s=>s.id===sourceRegistryId)?.canonicalUrl??""}))};
  const parsed=reportModerationDecisionSchema.safeParse(payload);if(!parsed.success){setError(parsed.error.issues[0]?.message??"Check the moderation decision.");return;}
  setError("");setNotice("");
  try{const response=await fetch(`${API}/v1/moderation/reports/${report.id}/decision`,{method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},body:JSON.stringify(parsed.data)});const result=await response.json() as {error?:string};
   if(!response.ok)throw new Error(result.error??"Decision could not be saved.");setReports(current=>current.filter(item=>item.id!==report.id));setNotice(`Report ${decision==="approve"?"approved and published":"rejected"}.`);
  }catch(e){setError(e instanceof Error?e.message:"Decision failed.");}
 }
 const disconnect=()=>{setToken("");setAuthenticated(false);setReports([]);setSources([]);setDecisions({});setError("");setNotice("");};
 return <main className="mod-shell"><header className="mod-header"><a className="brand" href="/"><span className="mark">N</span><span>NSA<small>NIGERIA SECURITY ALERTS</small></span></a><a className="mod-back" href="/">Public feed ↗</a></header>
 <section className="mod-intro"><span className="eyebrow">INTERNAL OPERATIONS</span><h1>Report review</h1><p>Review community submissions, validate evidence and decide what is safe to publish. Every decision is recorded.</p></section>
 {!authenticated?<section className="mod-login"><h2>Moderator access</h2><p>Enter a short-lived access token issued by your configured identity provider. It is held in page memory only and is never written to browser storage.</p><label>Access token<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste access token"/></label><button disabled={!token.trim()||loading} onClick={loadQueue}>{loading?"Verifying…":"Open moderation queue"}</button></section>:<section className="mod-queue"><div className="mod-queue-head"><div><span className="eyebrow">PENDING REVIEW</span><h2>{reports.length} reports</h2></div><div className="mod-actions"><button className="mod-secondary" onClick={loadQueue} disabled={loading}>{loading?"Refreshing…":"Refresh"}</button><button className="mod-secondary" onClick={disconnect}>Sign out</button></div></div>
 {sources.length===0&&<p className="mod-warning">No approved sources are available. A moderator must review and approve source registry records before reports can be published.</p>}
 {reports.length===0&&!loading&&<div className="mod-empty"><h3>Queue is clear</h3><p>There are no pending reports at the moment.</p></div>}
 {reports.map(report=>{const state=decisions[report.id]??{reason:"",verification:"officially_confirmed" as Verification,selected:[],urls:{}};const selectedSources=sources.filter(source=>state.selected.includes(source.id));const approvalReady=state.reason.trim().length>=5&&((state.verification==="corroborated"&&selectedSources.length>=2&&new Set(selectedSources.map(s=>s.publisherName)).size>=2)||(state.verification==="officially_confirmed"&&selectedSources.some(s=>s.isOfficial)));
 return <article className="mod-report" key={report.id}><div className="mod-report-meta"><span>{report.category.replaceAll("_"," ")}</span><span>{report.state}{report.locality?` · ${report.locality}`:""}</span><span>{new Date(report.createdAt).toLocaleString("en-NG")}</span></div><h3>{report.title}</h3><p>{report.summary}</p>{report.sourceUrl&&<a href={report.sourceUrl} target="_blank" rel="noreferrer">Reporter-supplied source ↗</a>}
 <label className="mod-field">Decision notes<textarea value={state.reason} onChange={e=>updateDecision(report.id,{reason:e.target.value})} placeholder="Record what you checked and why you reached this decision." rows={3}/></label>
 <div className="mod-verification"><label>Verification level<select value={state.verification} onChange={e=>updateDecision(report.id,{verification:e.target.value as Verification,selected:[]})}><option value="officially_confirmed">Officially confirmed</option><option value="corroborated">Corroborated by independent publishers</option></select></label><span>{state.verification==="officially_confirmed"?"Requires at least one official source.":"Requires at least two distinct publishers."}</span></div>
 <div className="mod-sources"><h4>Approved evidence sources</h4>{sources.map(source=><div className="mod-source" key={source.id}><label className="mod-check"><input type="checkbox" checked={state.selected.includes(source.id)} onChange={e=>updateDecision(report.id,{selected:e.target.checked?[...state.selected,source.id]:state.selected.filter(id=>id!==source.id)})}/><span><b>{source.displayName}</b><small>{source.publisherName}{source.isOfficial?" · Official source":""}</small></span></label>{state.selected.includes(source.id)&&<input aria-label={`Article URL from ${source.displayName}`} value={state.urls[source.id]??source.canonicalUrl} onChange={e=>updateDecision(report.id,{urls:{...state.urls,[source.id]:e.target.value}})} placeholder="HTTPS article URL"/>}</div>)}</div>
 <div className="mod-decision-buttons"><button className="mod-reject" disabled={state.reason.trim().length<5} onClick={()=>decide(report,"reject")}>Reject report</button><button className="mod-approve" disabled={!approvalReady} onClick={()=>decide(report,"approve")}>Approve and publish</button></div></article>})}</section>}
 {error&&<p className="mod-error" role="alert">{error}</p>}{notice&&<p className="mod-notice" role="status">{notice}</p>}<footer className="mod-foot">NSA is an independent public-information project. Moderation does not replace emergency-service verification.</footer></main>;
}
