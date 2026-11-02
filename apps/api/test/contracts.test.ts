import {describe,expect,it} from "vitest";
import {liveStreamCreateSchema,liveStreamTokenRequestSchema} from "../src/index";
const consent={privacyNoticeAccepted:true,noChildrenOrVulnerablePeople:true,noMedicalEmergencyBroadcast:true,identifiablePeopleHaveConsented:true,noExactLocationDisclosure:true};
describe("live video contracts",()=>{
 it("rejects incomplete safety consent",()=>expect(liveStreamCreateSchema.safeParse({title:"Live public update",description:"A public update from a safe location without private addresses or identifiable people.",state:"Lagos",consent:{privacyNoticeAccepted:true}}).success).toBe(false));
 it("accepts a fully acknowledged broadcast request",()=>expect(liveStreamCreateSchema.safeParse({title:"Live public update",description:"A public update from a safe location without private addresses or identifiable people.",state:"Lagos",consent}).success).toBe(true));
 it("rejects invalid token roles",()=>expect(liveStreamTokenRequestSchema.safeParse({role:"admin"}).success).toBe(false));
});
