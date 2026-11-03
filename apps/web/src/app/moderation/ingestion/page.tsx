"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {
 ingestionQueueResponseSchema,nigerianStateSchema,incidentCategorySchema,
 type IngestionQueueItem,type NigerianState,type IncidentCategory, type VerificationStatus
} from "@nsa/contracts";
import {useNsaAuth} from "../../providers";
import {apiFetch} from "../../../lib/api";

type Verification=Exclude<VerificationStatus,"unverified">;
export default function IngestionModerationPage(){
 const auth=useNsaAuth();
 const [items,setItems]=useState<IngestionQueueItem[]>([]);
 const [leadId,setLeadId]=useState("");
 const [selectedIds,setSelectedIds]=useState<string[]>([]);
 const [category,setCategory]=useState<IncidentCategory>("other");
 const [state,setState]=useState<NigerianState|"">("");
 const [locality,setLocality]=useState("");
 const [occurredAt,setOccurredAt]=useState("");
 const [verification,setVerification]=useState<Verification>("corroborated");
 const [reason,setReason]=useState("");
 const [rightsReviewNote,setRightsReviewNote]=useState("");
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const loadQueue=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await apiFetch("v1/moderation/ingestion-items?limit=50");
   if(response.status===401||response.status===403)throw new Error("This account is not authorized to review ingested items.");
   if(!response.ok)throw new Error("The ingestion review queue is unavailable.");
   const result=ingestionQueueResponseSchema.parse(await response.json());
   setItems(result.data);
   setSelectedIds(current=>current.filter(id=>result.data.some(item=>item.id===id)));
   setLeadId(current=>result.data.some(item=>item.id===current)?current:"");
  }catch(e){setError(e instanceof Error?e.message:"Could not load ingestion items.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{if(auth.authenticated)void loadQueue();else{setItems([]);setLeadId("");setSelectedIds([]);}},[auth.authenticated,loadQueue]);

 const lead=items.find(item=>item.id===leadId)??null;
 const selectedItems=useMemo(()=>items.filter(item=>selectedIds.includes(item.id)),[items,selectedIds]);
 const distinctPublishers=new Set(selectedItems.map(item=>item.publisherName)).size;
 const hasOfficialSource=selectedItems.some(item=>item.isOfficial);
 const canPublish=Boolean(lead&&selectedIds.includes(lead.id)&&state&&occurredAt&&reason.trim().length>=5&&rightsReviewNote.trim().length>=20&&selectedItems.length>=1&&selectedItems.length<=5&&(
  (verification==="officially_confirmed"&&hasOfficialSource)||
  (verification==="corroborated"&&selectedItems.length>=2&&distinctPublishers>=2)
 ));

 function chooseLead(item:IngestionQueueItem){
  setLeadId(item.id);setCategory(item.category);setState("");
  setLocality("");setOccurredAt("");
  setSelectedIds([item.id]);
 }
 function toggleEvidence(id:string,checked:boolean){
  setSelectedIds(current=>checked?(current.length>=5?current:[...current,id]):current.filter(value=>value!==id));
 }
 async function reject(item:IngestionQueueItem){
  if(reason.trim().length<5){setError("Enter a moderation reason of at least five characters.");return;}
  setSaving(true);setError("");setNotice("");
  try{
   const response=await apiFetch("v1/moderation/ingestion-items/"+item.id+"/decision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision:"reject",reason})});
   const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??"Could not reject this item.");
   setNotice("Item rejected.");setReason("");await loadQueue();
  }catch(e){setError(e instanceof Error?e.message:"Rejection failed.");}
  finally{setSaving(false);}
 }
 async function publish(){
  if(!lead||!canPublish)return;
  setSaving(true);setError("");setNotice("");
  try{
   const response=await apiFetch("v1/moderation/ingestion-items/"+lead.id+"/decision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    decision:"publish",reason,sourceIngestionItemIds:selectedIds,verificationStatus:verification,
    category,state,locality:locality.trim()||null,
    occurredAt:new Date(occurredAt+"T12:00:00.000Z").toISOString(),rightsReviewNote
   })});
   const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??"Could not publish this incident.");
   setNotice("Incident published after evidence checks.");setLeadId("");setSelectedIds([]);setReason("");setRightsReviewNote("");setLocality("");setOccurredAt("");await loadQueue();
  }catch(e){setError(e instanceof Error?e.message:"Publication failed.");}
  finally{setSaving(false);}
 }

 return <main className="mod-shell">
  <header className="mod-header"><Link className="brand" href="/"><span className="mark">N</span><span>NSA<small>NIGERIA SECURITY ALERTS</small></span></Link><Link className="mod-back" href="/moderation">Report moderation ↗</Link></header>
  <section className="mod-intro"><span className="eyebrow">SOURCE INGESTION</span><h1>Incident triage</h1><p>Only articles classified as public-safety relevant enter this queue. Priority is an urgency signal, not proof that an incident happened. Check the original source and independent evidence before publication.</p></section>
  {!auth.ready&&<p className="mod-notice">Preparing secure sign-in…</p>}
  {auth.error&&<p className="mod-error" role="alert">{auth.error}</p>}
  {auth.ready&&!auth.configured&&<section className="mod-login"><h2>Authentication is not configured</h2><p>Configure the OIDC issuer and client ID for the web app and matching API verification settings.</p></section>}
  {auth.ready&&auth.configured&&!auth.authenticated&&<section className="mod-login"><h2>Moderator access</h2><p>Sign in with a moderator or administrator account.</p><button onClick={()=>void auth.signIn()}>Sign in securely</button></section>}
  {auth.authenticated&&<>
   <section className="mod-queue">
    <div className="mod-queue-head"><div><span className="eyebrow">TRIAGE QUEUE</span><h2>{items.length} relevant items</h2></div><div className="mod-actions"><button className="mod-secondary" onClick={()=>void loadQueue()} disabled={loading}>{loading?"Refreshing…":"Refresh"}</button><button className="mod-secondary" onClick={()=>void auth.signOut()}>Sign out</button></div></div>
    {items.length===0&&!loading&&<div className="mod-empty"><h3>No relevant items waiting</h3><p>New matches will appear after the ingestion worker runs.</p></div>}
    {items.map(item=><article className="mod-report" key={item.id}>
     <div className="mod-report-meta"><span>{item.priority} priority</span><span>{item.category.replaceAll("_"," ")}</span><span>Relevance {item.relevanceScore}/100</span><span>{item.publisherName}</span></div>
     <h3>{item.title}</h3><p>{item.summary}</p>
     <p className="mod-muted">Matched: {item.matchedTerms.join(", ")||"No stored terms"} · {item.detectedState??"State not identified in article"}</p>
     <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open original article ↗</a>
     <div className="mod-decision-buttons">
      <label className="mod-check"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={event=>toggleEvidence(item.id,event.target.checked)} disabled={!selectedIds.includes(item.id)&&selectedIds.length>=5}/><span>Select as evidence</span></label>
      <button className="mod-secondary" onClick={()=>chooseLead(item)}>Use as incident</button>
      <button className="mod-reject" disabled={saving||reason.trim().length<5} onClick={()=>void reject(item)}>Reject item</button>
     </div>
    </article>)}
   </section>
   {lead&&<section className="mod-login">
    <span className="eyebrow">PUBLISHING CHECKLIST</span><h2>Prepare incident</h2>
    <p><b>Lead article:</b> {lead.title}</p>
    <p>{selectedItems.length} evidence items selected from {distinctPublishers} distinct publishers. Detected state mention: {lead.detectedState??"none"}. Verify the actual incident location and date from the source before entering them below.</p>
    <div className="mod-verification"><label>Verification level<select value={verification} onChange={event=>setVerification(event.target.value as Verification)}><option value="corroborated">Corroborated by independent publishers</option><option value="officially_confirmed">Officially confirmed</option></select></label><span>{verification==="corroborated"?"At least two different publishers are required.":"At least one official source is required."}</span></div>
    <label className="mod-field">Incident category<select value={category} onChange={event=>setCategory(event.target.value as IncidentCategory)}>{incidentCategorySchema.options.filter(value=>value!=="other").map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
    <label className="mod-field">State<select value={state} onChange={event=>setState(event.target.value as NigerianState|"")}><option value="">Select confirmed state</option>{nigerianStateSchema.options.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    <label className="mod-field">Locality (optional)<input value={locality} onChange={event=>setLocality(event.target.value)} maxLength={120} placeholder="Only if confirmed by the source"/></label>
    <label className="mod-field">Incident date (not article publication date)<input type="date" value={occurredAt} onChange={event=>setOccurredAt(event.target.value)}/></label>
    <label className="mod-field">Moderation reason<textarea rows={3} value={reason} onChange={event=>setReason(event.target.value)} placeholder="What evidence supports this decision?"/></label>
    <label className="mod-field">Rights review note<textarea rows={3} value={rightsReviewNote} onChange={event=>setRightsReviewNote(event.target.value)} placeholder="Record the source terms, attribution and permitted use. Do not copy full article text."/></label>
    <div className="mod-decision-buttons"><button className="mod-secondary" onClick={()=>{setLeadId("");setSelectedIds([]);}}>Cancel</button><button className="mod-approve" disabled={saving||!canPublish} onClick={()=>void publish()}>{saving?"Saving…":"Publish reviewed incident"}</button></div>
   </section>}
  </>}
  {error&&<p className="mod-error" role="alert">{error}</p>}{notice&&<p className="mod-notice" role="status">{notice}</p>}
  <footer className="mod-foot">Classification is automated triage only. It does not verify the report, confirm the location or authorise publication. Never publish an incident without evidence and rights review.</footer>
 </main>;
}
