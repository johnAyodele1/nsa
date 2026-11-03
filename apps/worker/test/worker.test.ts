import {afterEach,describe,expect,it,vi} from "vitest";
import type {Pool} from "pg";
import {fetchPublicFeed} from "../src/http.js";
import {ingestOneSource,type WorkerLogger} from "../src/worker.js";

vi.mock("../src/http.js",()=>({fetchPublicFeed:vi.fn()}));

const source={
 id:"00000000-0000-4000-8000-000000000001",
 publisher_name:"Test Publisher",
 display_name:"Test Feed",
 feed_url:"https://news.example/feed.xml",
 source_kind:"rss" as const,
 polling_interval_seconds:300,
 retention_days:30,
 last_etag:null,
 last_modified_at:null
};
const feedBody=`<?xml version="1.0"?><rss version="2.0"><channel><item><guid>story-1</guid><link>https://news.example/story-1</link><title>Gunmen kidnap 12 residents in Kaduna</title><description>Residents were abducted by armed men in Kaduna State and a ransom demand was made.</description><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
function makePool(rowCount=1){
 const query=vi.fn(async(sql:string,_values?:unknown[])=>{
  if(sql.includes("INSERT INTO source_ingestion_items"))return {rows:[],rowCount};
  return {rows:[],rowCount:1};
 });
 return {pool:{query} as unknown as Pool,query};
}
const logger:WorkerLogger={info:vi.fn(),warn:vi.fn(),error:vi.fn()};
afterEach(()=>{vi.clearAllMocks();});

describe("source ingestion worker",()=>{
 it("stages feed items without publishing incidents",async()=>{
  vi.mocked(fetchPublicFeed).mockResolvedValue({status:200,body:feedBody,etag:"etag-1",lastModified:null,contentType:"application/rss+xml"});
  const {pool,query}=makePool(1);
  await expect(ingestOneSource(pool,source,logger)).resolves.toBe(1);
  const insert=query.mock.calls.find(([sql])=>sql.includes("INSERT INTO source_ingestion_items"));
  expect(insert).toBeDefined();
  expect(insert?.[0]).toContain("ON CONFLICT(source_registry_id,external_id) DO NOTHING");
  expect(insert?.[0]).not.toMatch(/INSERT INTO incidents|UPDATE incidents/i);
  expect(query.mock.calls.some(([sql])=>/INSERT INTO incidents|UPDATE incidents/i.test(sql))).toBe(false);
  expect(logger.info).toHaveBeenCalledWith("Ingestion source checked",expect.objectContaining({itemsSeen:1,itemsAdded:1}));
 });

 it("excludes unrelated political appointments from the ingestion review queue",async()=>{
  const unrelated=`<?xml version="1.0"?><rss version="2.0"><channel><item><guid>politics-1</guid><link>https://news.example/story/politics-1</link><title>NDC names Ibezi, Umeh, Nwoye to Anambra campaign council</title><description>The party appointed campaign council members ahead of the 2027 general elections.</description><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  vi.mocked(fetchPublicFeed).mockResolvedValue({status:200,body:unrelated,etag:null,lastModified:null,contentType:"application/rss+xml"});
  const {pool,query}=makePool(1);
  await expect(ingestOneSource(pool,source,logger)).resolves.toBe(0);
  expect(query.mock.calls.some(([sql])=>sql.includes("INSERT INTO source_ingestion_items"))).toBe(false);
  expect(logger.info).toHaveBeenCalledWith("Ingestion source checked",expect.objectContaining({itemsSeen:1,itemsAdded:0,itemsExcluded:1}));
 });

 it("does not count duplicate source items as new",async()=>{
  vi.mocked(fetchPublicFeed).mockResolvedValue({status:200,body:feedBody,etag:null,lastModified:null,contentType:"application/rss+xml"});
  const {pool}=makePool(0);
  await expect(ingestOneSource(pool,source,logger)).resolves.toBe(0);
 });

 it("updates source check metadata without parsing a not-modified response",async()=>{
  vi.mocked(fetchPublicFeed).mockResolvedValue({status:304,body:"",etag:"etag-1",lastModified:"Mon, 02 Nov 2026 10:00:00 GMT",contentType:null});
  const {pool,query}=makePool();
  await expect(ingestOneSource(pool,source,logger)).resolves.toBe(0);
  expect(query.mock.calls.some(([sql])=>sql.includes("INSERT INTO source_ingestion_items"))).toBe(false);
  expect(query.mock.calls.some(([sql])=>sql.includes("last_checked_at=now()"))).toBe(true);
 });

 it("records a bounded error code and schedules retry after fetch failure",async()=>{
  vi.mocked(fetchPublicFeed).mockRejectedValue(new Error("FEED_HTTP_STATUS"));
  const {pool,query}=makePool();
  await expect(ingestOneSource(pool,source,logger)).resolves.toBe(0);
  const retry=query.mock.calls.find(([sql])=>sql.includes("consecutive_failures=LEAST"));
  expect(retry).toBeDefined();
  expect(retry?.[1]).toEqual([source.id,"FEED_HTTP_STATUS"]);
  expect(logger.warn).toHaveBeenCalledWith("Ingestion source failed",expect.objectContaining({sourceId:source.id,errorCode:"FEED_HTTP_STATUS"}));
 });
});
