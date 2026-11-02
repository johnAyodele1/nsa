import {describe,expect,it} from "vitest";
import {incidentQuerySchema} from "@nsa/contracts";
describe("incident query validation",()=>{
 it("accepts bounded pagination",()=>expect(incidentQuerySchema.parse({limit:"20"}).limit).toBe(20));
 it("rejects oversized cursors before cursor decoding",()=>expect(incidentQuerySchema.safeParse({cursor:"x".repeat(257)}).success).toBe(false));
 it("rejects oversized page requests",()=>expect(incidentQuerySchema.safeParse({limit:"500"}).success).toBe(false));
 it("rejects empty state filters",()=>expect(incidentQuerySchema.safeParse({state:""}).success).toBe(false));
});
