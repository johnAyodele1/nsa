import {describe,expect,it} from "vitest";
import {liveStreamCreateSchema,liveStreamTokenRequestSchema,liveStreamConsentSchema,liveStreamReportSchema} from "@nsa/contracts";
const consent={privacyNoticeAccepted:true,noChildrenOrVulnerablePeople:true,noMedicalEmergencyBroadcast:true,identifiablePeopleHaveConsented:true,noExactLocationDisclosure:true};
const valid={title:"Live public update",description:"A public update from a safe location without private addresses or identifiable people.",state:"Lagos",consent};
describe("live video contracts",()=>{
 it("rejects incomplete safety consent",()=>expect(liveStreamCreateSchema.safeParse({...valid,consent:{privacyNoticeAccepted:true}}).success).toBe(false));
 it("accepts a fully acknowledged broadcast request",()=>expect(liveStreamCreateSchema.safeParse(valid).success).toBe(true));
 it("rejects unknown consent fields and false acknowledgements",()=>{expect(liveStreamConsentSchema.safeParse({...consent,tracking:true}).success).toBe(false);expect(liveStreamConsentSchema.safeParse({...consent,noExactLocationDisclosure:false}).success).toBe(false);});
 it("rejects invalid token roles and unknown keys",()=>{expect(liveStreamTokenRequestSchema.safeParse({role:"admin"}).success).toBe(false);expect(liveStreamTokenRequestSchema.safeParse({role:"viewer",admin:true}).success).toBe(false);});
 it("requires a meaningful abuse report reason",()=>{expect(liveStreamReportSchema.safeParse({reason:"bad"}).success).toBe(false);expect(liveStreamReportSchema.safeParse({reason:"This broadcast shows an identifiable child without consent."}).success).toBe(true);});
});
