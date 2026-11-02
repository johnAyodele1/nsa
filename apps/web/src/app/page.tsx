"use client";
import {useEffect,useRef,useState} from "react";
import {incidentListResponseSchema,nigerianStateSchema,incidentCategorySchema,type Incident,type NigerianState,type IncidentCategory} from "@nsa/contracts";
const API=process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000";
export default function HomePage(){
 const [items,setItems]=useState<Incident[]>([]);
 const [status,setStatus]=useState<"loading"|"ready"|"unavailable">("loading");
 const [state,setState]=useState<NigerianState|"">("");
 const [category,setCategory]=useState<IncidentCategory|"">("");
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loadingMore,setLoadingMore]=useState(false);
 const [moreError,setMoreError]=useState(false);
 const filterKey=`${state}|${category}`;
 const activeFilter=useRef(filterKey);
 useEffect(()=>{
  const controller=new AbortController();activeFilter.current=filterKey;setStatus("loading");setItems([]);setNextCursor(null);setMoreError(false);
  const params=new URLSearchParams({limit:"20"});if(state)params.set("state",state);if(category)params.set("category",category);
  fetch(`${API}/v1/incidents?${params.toString()}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("Feed unavailable");return incidentListResponseSchema.parse(await response.json());}).then(data=>{setItems(data.data);setNextCursor(data.nextCursor);setStatus("ready");}).catch((error:unknown)=>{if(!(error instanceof Error&&error.name==="AbortError"))setStatus("unavailable");});
  return()=>controller.abort();
 },[state,category,filterKey]);
 async function loadMore(){
  if(!nextCursor||loadingMore)return;
  const requestedFilter=filterKey;setLoadingMore(true);setMoreError(false);
  const params=new URLSearchParams({limit:"20",cursor:nextCursor});if(state)params.set("state",state);if(category)params.set("category",category);
  try{const response=await fetch(`${API}/v1/incidents?${params.toString()}`);if(!response.ok)throw new Error("Unable to load more incidents");const data=incidentListResponseSchema.parse(await response.json());if(activeFilter.current===requestedFilter){setItems(current=>[...current,...data.data]);setNextCursor(data.nextCursor);}}
  catch{if(activeFilter.current===requestedFilter)setMoreError(true);}
  finally{setLoadingMore(false);}
 }
 return <main className="shell"><header className="topbar"><a className="brand" href="/"><span className="mark">N</span><span>NSA<small>NIGERIA SECURITY ALERTS</small></span></a><nav><a href="#incidents">Incidents</a><a href="#about">About</a></nav></header>
 <section className="hero"><div className="eyebrow">● PUBLIC SAFETY INFORMATION</div><h1>Stay aware.<br/><em>Stay prepared.</em></h1><p>Community safety information from reviewed public sources, organised for people across Nigeria.</p><a className="cta" href="#incidents">Explore incident updates ↗</a><div className="note">INDEPENDENT PUBLIC INFORMATION PLATFORM · NIGERIA</div></section>
 <section id="incidents" className="feed"><div className="heading"><div><span className="eyebrow">THE LATEST</span><h2>Incident updates</h2></div><span className="count">{String(items.length).padStart(2,"0")} RECORDS</span></div>
 <div className="filters"><label>State<select value={state} onChange={event=>setState(event.target.value as NigerianState|"")}><option value="">All states</option>{nigerianStateSchema.options.map(value=><option key={value} value={value}>{value}</option>)}</select></label><label>Incident type<select value={category} onChange={event=>setCategory(event.target.value as IncidentCategory|"")}><option value="">All categories</option>{incidentCategorySchema.options.map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label><button className="clear" onClick={()=>{setState("");setCategory("");}} disabled={!state&&!category}>Clear filters</button></div>
 {status==="loading"&&<p className="state">Loading reviewed updates…</p>}{status==="unavailable"&&<p className="state">The incident service is unavailable. Please try again later.</p>}{status==="ready"&&items.length===0&&<div className="empty"><b>◎</b><h3>No published updates found</h3><p>Try another state or incident type. Only reviewed reports appear here; unverified claims are not published as fact.</p></div>}
 <div className="cards">{items.map(item=><article className="card" key={item.id}><div className="meta"><span>{item.category.replaceAll("_"," ")}</span><span>{item.verificationStatus.replaceAll("_"," ")}</span></div><h3>{item.title}</h3><p>{item.summary}</p><footer>{item.locality?item.locality+", ":""}{item.state} · {new Date(item.publishedAt).toLocaleDateString("en-NG")}</footer>{item.publicSourceUrl&&<a href={item.publicSourceUrl} target="_blank" rel="noreferrer">View source ↗</a>}</article>)}</div>
 {status==="ready"&&nextCursor&&<div className="load-more"><button onClick={loadMore} disabled={loadingMore}>{loadingMore?"Loading…":"Load more updates"}</button>{moreError&&<p role="alert">Could not load more updates. Try again.</p>}</div>}
 </section>
 <section id="about" className="disclaimer"><span className="eyebrow">IMPORTANT</span><p>NSA is an independent information platform, not an emergency dispatch service and not affiliated with a government agency. For immediate danger, contact the appropriate emergency service directly. Always check the linked primary source.</p></section><footer className="site-footer"><span>NSA / NIGERIA</span><span>Public information. Responsible reporting.</span></footer></main>;
}
