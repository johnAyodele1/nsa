import {describe,expect,it} from "vitest";
import {isAllowedProxyRoute} from "../src/server/proxy-policy";
const id="123e4567-e89b-12d3-a456-426614174000";
describe("web BFF route allowlist",()=>{
 it("allows only approved authenticated reads",()=>{expect(isAllowedProxyRoute("GET","/v1/live-sessions/mine")).toBe(true);expect(isAllowedProxyRoute("GET","/v1/live-sessions/moderation/live")).toBe(true);expect(isAllowedProxyRoute("GET","/v1/moderation/reports")).toBe(true);expect(isAllowedProxyRoute("GET","/v1/auth/admin/moderators")).toBe(true);expect(isAllowedProxyRoute("GET","/v1/users")).toBe(false);});
 it("allows narrowly scoped report, live and privacy writes",()=>{expect(isAllowedProxyRoute("POST","/v1/live-sessions")).toBe(true);expect(isAllowedProxyRoute("POST","/v1/live-sessions/"+id+"/token")).toBe(true);expect(isAllowedProxyRoute("POST","/v1/live-sessions/moderation/"+id+"/decision")).toBe(true);expect(isAllowedProxyRoute("POST","/v1/privacy/requests")).toBe(true);expect(isAllowedProxyRoute("POST","/v1/auth/admin/moderators")).toBe(true);expect(isAllowedProxyRoute("POST","/v1/auth/admin/moderators/revoke")).toBe(true);expect(isAllowedProxyRoute("POST","/v1/admin/promote")).toBe(false);});
 it("rejects unknown methods and malformed identifiers",()=>{expect(isAllowedProxyRoute("DELETE","/v1/live-sessions/"+id+"/end")).toBe(false);expect(isAllowedProxyRoute("POST","/v1/live-sessions/not-a-uuid/end")).toBe(false);expect(isAllowedProxyRoute("PATCH","/v1/reports")).toBe(false);});
});
