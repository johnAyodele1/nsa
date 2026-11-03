import {describe,expect,it} from "vitest";
import {classifyFeedItem} from "../src/relevance.js";

describe("public-safety relevance classification",()=>{
 it("classifies kidnapping as critical and extracts a state only when named",()=>{
  const result=classifyFeedItem({title:"Gunmen kidnap 12 residents in Kaduna",summary:"Residents were abducted by armed men in Kaduna State and a ransom demand was made."});
  expect(result).toMatchObject({category:"kidnapping",priority:"critical",relevanceScore:98,detectedState:"Kaduna"});
  expect(result?.matchedTerms).toContain("kidnap");
 });
 it("flags disease outbreaks such as Ebola for urgent review",()=>{
  expect(classifyFeedItem({title:"Ebola outbreak confirmed after new cases",summary:"Health authorities have confirmed an Ebola outbreak and begun public-health response measures."})).toMatchObject({category:"disease_outbreak",priority:"critical"});
 });
 it("classifies terrorism, banditry, fires, flooding and road accidents",()=>{
  expect(classifyFeedItem({title:"Boko Haram attack reported in Borno",summary:"An insurgent attack was reported in Borno State."})?.category).toBe("terrorism");
  expect(classifyFeedItem({title:"Bandits attack village in Zamfara",summary:"Armed bandits raided a community in Zamfara State."})?.category).toBe("banditry");
  expect(classifyFeedItem({title:"Market fire destroys shops in Lagos",summary:"A fire outbreak damaged shops in Lagos State."})?.category).toBe("fire");
  expect(classifyFeedItem({title:"Flooding displaces residents in Kogi",summary:"Flood waters entered homes in Kogi State."})?.category).toBe("flooding");
  expect(classifyFeedItem({title:"Bus crash kills passengers in Ogun",summary:"A road accident involving a bus was reported in Ogun State."})?.category).toBe("road_accident");
 });
 it("excludes routine politics and appointments such as the NDC campaign council story",()=>{
  expect(classifyFeedItem({title:"NDC names Ibezi, Umeh, Nwoye to Anambra campaign council",summary:"The party appointed campaign council members ahead of the 2027 general elections."})).toBeNull();
 });
 it("does not invent a state when the article does not identify one",()=>{
  expect(classifyFeedItem({title:"Gunmen attack a community",summary:"Residents reported an overnight attack by armed men."})?.detectedState).toBeNull();
 });
});
