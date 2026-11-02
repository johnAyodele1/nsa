import {describe,expect,it} from "vitest";
import {ingestionModerationDecisionSchema} from "../src/index";
const itemA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const valid={decision:"publish",reason:"Reviewed source details and incident time.",sourceIngestionItemIds:[itemA],verificationStatus:"officially_confirmed",category:"fire",state:"Lagos",occurredAt:"2026-11-02T08:00:00.000Z",rightsReviewNote:"Reviewed publisher terms and confirmed that headline and link attribution are permitted."};
describe("ingestion moderation contract",()=>{
 it("requires documented rights review",()=>expect(ingestionModerationDecisionSchema.safeParse({...valid,rightsReviewNote:undefined}).success).toBe(false));
 it("requires multiple items for corroboration",()=>expect(ingestionModerationDecisionSchema.safeParse({...valid,sourceIngestionItemIds:[itemA],verificationStatus:"corroborated"}).success).toBe(false));
 it("accepts reviewed official confirmation",()=>expect(ingestionModerationDecisionSchema.safeParse(valid).success).toBe(true));
 it("rejects duplicate item IDs",()=>expect(ingestionModerationDecisionSchema.safeParse({...valid,sourceIngestionItemIds:[itemA,itemA]}).success).toBe(false));
 it("rejects publication metadata on a rejection",()=>expect(ingestionModerationDecisionSchema.safeParse({decision:"reject",reason:"This item is not relevant.",category:"fire"}).success).toBe(false));
 it("accepts a reviewed rejection",()=>expect(ingestionModerationDecisionSchema.safeParse({decision:"reject",reason:"The source item does not describe an incident."}).success).toBe(true));
});
