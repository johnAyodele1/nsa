import { z } from "zod";
export const incidentCategorySchema = z.enum(["robbery","theft","kidnapping","assault","fire","road_accident","flooding","building_collapse","public_disturbance","missing_person","other"]);
export const verificationStatusSchema = z.enum(["unverified","corroborated","officially_confirmed"]);
export const incidentSchema = z.object({
 id:z.string().uuid(), title:z.string().min(8).max(180), summary:z.string().min(20).max(2000),
 category:incidentCategorySchema, state:z.string().min(2).max(64), locality:z.string().max(120).nullable(),
 occurredAt:z.string().datetime(), publishedAt:z.string().datetime(), verificationStatus:verificationStatusSchema,
 sourceCount:z.number().int().min(0), publicSourceUrl:z.string().url().nullable()
}).strict();
export const incidentListResponseSchema=z.object({data:z.array(incidentSchema),nextCursor:z.string().uuid().nullable()}).strict();
export const incidentQuerySchema=z.object({state:z.string().min(2).max(64).optional(),category:incidentCategorySchema.optional(),cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export type Incident=z.infer<typeof incidentSchema>;
export type IncidentCategory=z.infer<typeof incidentCategorySchema>;
