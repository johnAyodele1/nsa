import {createHash} from "node:crypto";
import {XMLParser,XMLValidator} from "fast-xml-parser";
import {z} from "zod";

export type FeedItem={externalId:string;url:string;title:string;summary:string;publishedAt:string|null};
const jsonFeedSchema=z.object({version:z.string().url().refine(value=>value==="https://jsonfeed.org/version/1"||value==="https://jsonfeed.org/version/1.1"),items:z.array(z.object({id:z.string().min(1).max(500),url:z.string().url().optional(),external_url:z.string().url().optional(),title:z.string().min(1).max(500).optional(),summary:z.string().max(10000).optional(),content_text:z.string().max(10000).optional(),date_published:z.string().optional()}).passthrough()).max(200)}).passthrough();
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@",parseTagValue:false,trimValues:true,processEntities:false,allowBooleanAttributes:false});
function oneOrMany(value:unknown):Record<string,unknown>[] {if(value===undefined||value===null)return [];return (Array.isArray(value)?value:[value]).filter((item):item is Record<string,unknown>=>typeof item==="object"&&item!==null);}
function text(value:unknown):string {if(typeof value==="string")return value;if(typeof value==="number")return String(value);if(typeof value==="object"&&value!==null&&"#text"in value)return text((value as Record<string,unknown>)["#text"]);return "";}
export function cleanFeedText(value:string,max=600):string {return value.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim().slice(0,max);}
function safeItemUrl(value:string|undefined):string|null {if(!value)return null;try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.href.length>2048)return null;url.hash="";return url.toString();}catch{return null;}}
function normalizeItem(id:string,url:string,title:string,summary:string,published:string):FeedItem|null {
 const safeUrl=safeItemUrl(url);const cleanTitle=cleanFeedText(title,180);const cleanSummary=cleanFeedText(summary,600);if(!safeUrl||cleanTitle.length<8||cleanSummary.length<20)return null;
 const externalId=id.trim().slice(0,500)||createHash("sha256").update(safeUrl+"\n"+cleanTitle+"\n"+published).digest("hex");
 const parsedDate=published?new Date(published):null;const publishedAt=parsedDate&&!Number.isNaN(parsedDate.getTime())?parsedDate.toISOString():null;
 return {externalId,url:safeUrl,title:cleanTitle,summary:cleanSummary,publishedAt};
}
export function parseRssOrAtom(xml:string,kind:"rss"|"atom"):FeedItem[]{
 if(xml.length>1_000_000)throw new Error("FEED_TOO_LARGE");if(XMLValidator.validate(xml)!==true)throw new Error("INVALID_XML");
 const parsed=parser.parse(xml) as Record<string,unknown>;
 const records=kind==="rss"?oneOrMany(((parsed.rss as Record<string,unknown>|undefined)?.channel as Record<string,unknown>|undefined)?.item):oneOrMany((parsed.feed as Record<string,unknown>|undefined)?.entry);
 return records.flatMap(item=>{
  const linkValue=item.link;let link="";
  if(typeof linkValue==="string")link=linkValue;
  else if(Array.isArray(linkValue)){const found=linkValue.find(value=>typeof value==="object"&&value!==null&&((value as Record<string,unknown>)["@rel"]==="alternate"||(value as Record<string,unknown>)["@rel"]===undefined));link=String((found as Record<string,unknown>|undefined)?.["@href"]??"");}
  else if(typeof linkValue==="object"&&linkValue!==null)link=String((linkValue as Record<string,unknown>)["@href"]??"");
  const id=text(item.guid)||text(item.id)||link;const title=text(item.title);const summary=text(item.description)||text(item.summary)||text(item.content);
  const published=text(item.pubDate)||text(item.published)||text(item.updated)||text(item["dc:date"]);
  const normalized=normalizeItem(id,link,title,summary,published);return normalized?[normalized]:[];
 });
}
export function parseJsonFeed(input:string):FeedItem[]{
 if(input.length>1_000_000)throw new Error("FEED_TOO_LARGE");let json:unknown;try{json=JSON.parse(input);}catch{throw new Error("INVALID_JSON_FEED");}
 const parsed=jsonFeedSchema.safeParse(json);if(!parsed.success)throw new Error("UNSUPPORTED_JSON_FEED");
 return parsed.data.items.flatMap(item=>{const url=item.url??item.external_url??"";const normalized=normalizeItem(item.id,url,item.title??"",item.summary??item.content_text??"",item.date_published??"");return normalized?[normalized]:[];});
}
