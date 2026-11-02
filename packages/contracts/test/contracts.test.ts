import {describe,expect,it} from "vitest";
import {incidentSchema,incidentQuerySchema,reportSubmissionSchema,reportModerationDecisionSchema} from "../src/index";
const valid={id:"2f4e4b18-22b5-4d14-bbcb-17c48edc05d1",title:"Verified road closure notice",summary:"A road closure notice published by an approved source. Check the source for current diversion details.",category:"road_accident",state:"Lagos",locality:"Ikeja",occurredAt:"2026-11-02T08:00:00.000Z",publishedAt:"2026-11-02T08:30:00.000Z",verificationStatus:"corroborated",sourceCount:2,publicSourceUrl:"https://example.gov.ng/notices/1"};
const report={title:"Road obstruction near Ikeja",summary:"A fallen tree is blocking one lane near the junction. Drivers should take care while the report is reviewed.",category:"road_accident",state:"Lagos",locality:"Ikeja",occurredAt:"2026-11-02T08:00:00.000Z"};
describe("shared incident contracts",()=>{
 it("accepts valid incident data",()=>expect(incidentSchema.safeParse(valid).success).toBe(true));
 it("rejects unknown private fields",()=>expect(incidentSchema.safeParse({...valid,reporterPhone:"08000000000"}).success).toBe(false));
 it("rejects unsupported categories",()=>expect(incidentSchema.safeParse({...valid,category:"rumour"}).success).toBe(false));
 it("rejects locations outside Nigeria",()=>expect(incidentSchema.safeParse({...valid,state:"Accra"}).success).toBe(false));
 it("bounds page size",()=>{expect(incidentQuerySchema.safeParse({limit:500}).success).toBe(false);expect(incidentQuerySchema.parse({}).limit).toBe(20);});
});
describe("report submission contracts",()=>{
 it("accepts a report with Nigerian state and no reporter PII",()=>expect(reportSubmissionSchema.safeParse(report).success).toBe(true));
 it("rejects markup in report descriptions",()=>expect(reportSubmissionSchema.safeParse({...report,summary:"<script>alert(1)</script> malicious content"}).success).toBe(false));
 it("rejects HTTP source URLs",()=>expect(reportSubmissionSchema.safeParse({...report,sourceUrl:"http://example.com/report"}).success).toBe(false));
 it("rejects unknown fields such as a reporter phone number",()=>expect(reportSubmissionSchema.safeParse({...report,reporterPhone:"08000000000"}).success).toBe(false));
});
describe("moderation decision contracts",()=>{
 const sourceA={sourceRegistryId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",sourceUrl:"https://agency.example/notices/1"};
 const sourceB={sourceRegistryId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",sourceUrl:"https://news.example/story/1"};
 it("requires reviewed evidence to approve a report",()=>expect(reportModerationDecisionSchema.safeParse({decision:"approve",reason:"Verified against primary sources.",verificationStatus:"officially_confirmed",sources:[sourceA]}).success).toBe(true));
 it("requires two distinct source records for corroboration",()=>expect(reportModerationDecisionSchema.safeParse({decision:"approve",reason:"Cross-checked with independent publishers.",verificationStatus:"corroborated",sources:[sourceA]}).success).toBe(false));
 it("accepts corroboration with multiple sources",()=>expect(reportModerationDecisionSchema.safeParse({decision:"approve",reason:"Cross-checked with independent publishers.",verificationStatus:"corroborated",sources:[sourceA,sourceB]}).success).toBe(true));
 it("rejects duplicate source IDs",()=>expect(reportModerationDecisionSchema.safeParse({decision:"approve",reason:"Cross-checked with independent publishers.",verificationStatus:"corroborated",sources:[sourceA,{...sourceB,sourceRegistryId:sourceA.sourceRegistryId}]}).success).toBe(false));
 it("does not accept publication evidence on a rejection",()=>expect(reportModerationDecisionSchema.safeParse({decision:"reject",reason:"The report is not supported.",sources:[sourceA]}).success).toBe(false));
});
