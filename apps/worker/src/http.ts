import {lookup} from "node:dns/promises";
import {lookup as callbackLookup} from "node:dns";
import {Agent,request} from "undici";
import ipaddr from "ipaddr.js";
type LookupFunction=typeof callbackLookup;

const MAX_BYTES=1_000_000;
function isPublicAddress(address:string):boolean {try{return ipaddr.parse(address).range()==="unicast";}catch{return false;}}
export async function validatePublicHttpsUrl(raw:string):Promise<URL>{
 if(raw.length>2048)throw new Error("INVALID_FEED_URL");
 let url:URL;try{url=new URL(raw);}catch{throw new Error("INVALID_FEED_URL");}
 if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443"||url.hostname==="localhost"||url.hostname.endsWith(".localhost")||url.hostname.endsWith(".local"))throw new Error("UNSAFE_FEED_URL");
 const addresses=await lookup(url.hostname,{all:true,verbatim:true});
 if(addresses.length===0||addresses.some(record=>!isPublicAddress(record.address)))throw new Error("UNSAFE_FEED_HOST");
 return url;
}
async function pinnedAgent(hostname:string):Promise<Agent>{
 const addresses=await lookup(hostname,{all:true,verbatim:true});
 if(addresses.length===0||addresses.some(record=>!isPublicAddress(record.address)))throw new Error("UNSAFE_FEED_HOST");
 const selected=addresses[0];if(!selected)throw new Error("DNS_LOOKUP_FAILED");
 const pinnedLookup:LookupFunction=(_name,options,callback)=>{
  if(typeof options==="object"&&options!==null&&"all"in options&&options.all)callback(null,addresses);
  else callback(null,selected.address,selected.family);
 };
 return new Agent({connect:{lookup:pinnedLookup}});
}
export type FetchResult={status:number;body:string;etag:string|null;lastModified:string|null;contentType:string|null};
export async function fetchPublicFeed(rawUrl:string,headers:{etag?:string|null;lastModified?:string|null}={}):Promise<FetchResult>{
 let current=rawUrl;
 for(let redirects=0;redirects<=3;redirects++){
  const url=await validatePublicHttpsUrl(current);const dispatcher=await pinnedAgent(url.hostname);
  try{
   const response=await request(url,{method:"GET",headers:{accept:"application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml;q=0.8, text/xml;q=0.7","user-agent":"NSA-Public-Information-Ingestion/1.0 (+source-contact-required)",...(headers.etag?{"if-none-match":headers.etag}:{}),...(headers.lastModified?{"if-modified-since":headers.lastModified}:{})},headersTimeout:10000,bodyTimeout:10000,maxResponseSize:MAX_BYTES,dispatcher});
   if([301,302,303,307,308].includes(response.statusCode)){const location=response.headers.location;if(typeof location!=="string"||redirects===3)throw new Error("FEED_REDIRECT_LIMIT");current=new URL(location,url).toString();continue;}
   if(response.statusCode===304)return {status:304,body:"",etag:typeof response.headers.etag==="string"?response.headers.etag:headers.etag??null,lastModified:typeof response.headers["last-modified"]==="string"?response.headers["last-modified"]:headers.lastModified??null,contentType:null};
   if(response.statusCode!==200)throw new Error("FEED_HTTP_STATUS");
   const body=await response.body.text();if(Buffer.byteLength(body,"utf8")>MAX_BYTES)throw new Error("FEED_TOO_LARGE");
   const contentType=typeof response.headers["content-type"]==="string"?response.headers["content-type"].toLowerCase():null;
   if(!contentType||!/(xml|rss|atom|json)/i.test(contentType))throw new Error("UNSUPPORTED_FEED_CONTENT_TYPE");
   return {status:200,body,etag:typeof response.headers.etag==="string"?response.headers.etag:null,lastModified:typeof response.headers["last-modified"]==="string"?response.headers["last-modified"]:null,contentType};
  }finally{await dispatcher.close();}
 }
 throw new Error("FEED_REDIRECT_LIMIT");
}
