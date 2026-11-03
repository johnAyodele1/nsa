import {describe,expect,it} from "vitest";
import {allowedGetQueryKeys,isAllowedProxyRoute,isPublicProxyRoute} from "./proxy-policy.js";

describe("web API proxy policy",()=>{
 it("allows unauthenticated read-only access only to public directories and incidents",()=>{
  for(const path of ["/v1/incidents","/v1/agencies","/v1/emergency-contacts"]){
   expect(isAllowedProxyRoute("GET",path)).toBe(true);
   expect(isPublicProxyRoute("GET",path)).toBe(true);
   expect(isPublicProxyRoute("POST",path)).toBe(false);
  }
  expect(isPublicProxyRoute("GET","/v1/moderation/ingestion-items")).toBe(false);
 });
 it("forwards every supported incident filter but no arbitrary query parameters",()=>{
  expect(allowedGetQueryKeys("/v1/incidents")).toEqual(["limit","cursor","state","category","priority"]);
  expect(allowedGetQueryKeys("/v1/emergency-contacts")).toEqual(["state"]);
  expect(allowedGetQueryKeys("/v1/moderation/reports")).toEqual(["limit","cursor"]);
 });
 it("does not expose writes or unknown endpoints through the proxy",()=>{
  expect(isAllowedProxyRoute("POST","/v1/incidents")).toBe(false);
  expect(isAllowedProxyRoute("GET","/v1/private-data")).toBe(false);
 });
});
