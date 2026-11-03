import {z} from "zod";
export const nigerianStateSchema=z.enum(["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara","Federal Capital Territory"]);
export const incidentCategorySchema=z.enum(["robbery","theft","kidnapping","assault","fire","road_accident","flooding","building_collapse","public_disturbance","missing_person","disease_outbreak","terrorism","shooting","banditry","other"]);
export const incidentPrioritySchema=z.enum(["critical","high","medium"]);
export const verificationStatusSchema=z.enum(["unverified","corroborated","officially_confirmed"]);
export const incidentSchema=z.object({id:z.string().uuid(),title:z.string().min(8).max(180),summary:z.string().min(20).max(2000),category:incidentCategorySchema,state:nigerianStateSchema,locality:z.string().max(120).nullable(),occurredAt:z.string().datetime(),publishedAt:z.string().datetime(),verificationStatus:verificationStatusSchema,priority:incidentPrioritySchema.default("medium"),sourceCount:z.number().int().min(0),publicSourceUrl:z.string().url().nullable()}).strict();
export const incidentListResponseSchema=z.object({data:z.array(incidentSchema),nextCursor:z.string().max(256).nullable()}).strict();
export const incidentQuerySchema=z.object({state:nigerianStateSchema.optional(),category:incidentCategorySchema.optional(),priority:incidentPrioritySchema.optional(),cursor:z.string().min(1).max(256).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const reportSubmissionSchema=z.object({title:z.string().trim().min(8).max(180),summary:z.string().trim().min(20).max(2000).refine(value=>!/<[^>]*>/.test(value),"HTML markup is not accepted"),category:incidentCategorySchema,state:nigerianStateSchema,locality:z.string().trim().max(120).nullable().optional(),occurredAt:z.string().datetime(),sourceUrl:z.string().url().refine(value=>value.startsWith("https://"),"Source URL must use HTTPS").nullable().optional()}).strict();
export const reportSubmissionResponseSchema=z.object({data:z.object({id:z.string().uuid(),status:z.literal("pending_review"),createdAt:z.string().datetime()}).strict()}).strict();
export const reportStatusSchema=z.object({id:z.string().uuid(),title:z.string(),status:z.enum(["pending_review","approved","rejected"]),createdAt:z.string().datetime(),reviewedAt:z.string().datetime().nullable(),incidentId:z.string().uuid().nullable()}).strict();
export const reportListQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const reportListResponseSchema=z.object({data:z.array(reportStatusSchema)}).strict();
export const reportModerationDecisionSchema=z.object({decision:z.enum(["approve","reject"]),reason:z.string().trim().min(5).max(1000),verificationStatus:z.enum(["corroborated","officially_confirmed"]).optional(),sources:z.array(z.object({sourceRegistryId:z.string().uuid(),sourceUrl:z.string().url().refine(value=>value.startsWith("https://"),"Source URL must use HTTPS")}).strict()).min(1).max(5).optional()}).strict().superRefine((value,ctx)=>{
 if(value.decision==="approve"&&(!value.verificationStatus||!value.sources?.length))ctx.addIssue({code:"custom",message:"Approval requires a verification status and reviewed sources"});
 if(value.decision==="reject"&&(value.verificationStatus||value.sources))ctx.addIssue({code:"custom",message:"Rejection cannot include publication evidence"});
 if(value.verificationStatus==="corroborated"&&(value.sources?.length??0)<2)ctx.addIssue({code:"custom",message:"Corroboration requires at least two sources"});
 const ids=value.sources?.map(source=>source.sourceRegistryId)??[];
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"Source registry IDs must be unique"});
});
export const moderationQueueQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const moderationSourceSchema=z.object({id:z.string().uuid(),publisherName:z.string().min(1).max(160),displayName:z.string().min(1).max(160),canonicalUrl:z.string().url(),isOfficial:z.boolean()}).strict();
export const moderationSourceListResponseSchema=z.object({data:z.array(moderationSourceSchema)}).strict();
export const moderationQueueItemSchema=z.object({id:z.string().uuid(),title:z.string(),summary:z.string(),category:incidentCategorySchema,state:nigerianStateSchema,locality:z.string().nullable(),occurredAt:z.string().datetime(),sourceUrl:z.string().url().nullable(),createdAt:z.string().datetime()}).strict();
export const moderationQueueResponseSchema=z.object({data:z.array(moderationQueueItemSchema)}).strict();
export type ModerationQueueItem=z.infer<typeof moderationQueueItemSchema>;
export type ModerationSource=z.infer<typeof moderationSourceSchema>;
export type VerificationStatus=z.infer<typeof verificationStatusSchema>;
export const emergencyContactQuerySchema=z.object({state:nigerianStateSchema.optional()}).strict();
export const emergencyContactSchema=z.object({id:z.string().uuid(),agencyName:z.string().min(1).max(180),label:z.string().min(1).max(120),phoneNumber:z.string().regex(/^(\+234[0-9]{7,10}|[0-9]{3,6})$/),scope:z.string().min(1).max(80),sourceUrl:z.string().url(),verifiedAt:z.string().datetime(),nextReviewAt:z.string().datetime()}).strict();
export const emergencyContactListResponseSchema=z.object({data:z.array(emergencyContactSchema)}).strict();
export type EmergencyContact=z.infer<typeof emergencyContactSchema>;
export const agencyContactSchema=z.object({id:z.string().uuid(),label:z.string().min(1).max(100),phoneNumber:z.string().regex(/^(\+234[0-9]{7,10}|0[0-9]{10}|[0-9]{3,6})$/),contactType:z.enum(["emergency","hotline","office"]),sourceUrl:z.string().url(),verifiedAt:z.string().datetime()}).strict();
export const agencyDirectoryItemSchema=z.object({id:z.string().uuid(),name:z.string().min(1).max(180),acronym:z.string().max(24).nullable(),scope:z.string().min(1).max(80),description:z.string().min(1).max(1000),officialWebsite:z.string().url(),sourceUrl:z.string().url(),sourceVerifiedAt:z.string().datetime(),nextReviewAt:z.string().datetime(),contacts:z.array(agencyContactSchema)}).strict();
export const agencyDirectoryResponseSchema=z.object({data:z.array(agencyDirectoryItemSchema)}).strict();
export type AgencyDirectoryItem=z.infer<typeof agencyDirectoryItemSchema>;
export type AgencyContact=z.infer<typeof agencyContactSchema>;
export type Incident=z.infer<typeof incidentSchema>;
export type IncidentCategory=z.infer<typeof incidentCategorySchema>;
export type IncidentPriority=z.infer<typeof incidentPrioritySchema>;
export type NigerianState=z.infer<typeof nigerianStateSchema>;
export type ReportSubmission=z.infer<typeof reportSubmissionSchema>;
export type ReportModerationDecision=z.infer<typeof reportModerationDecisionSchema>;

export const ingestionQueueItemSchema=z.object({
 id:z.string().uuid(),
 title:z.string().min(8).max(180),
 summary:z.string().min(20).max(600),
 sourceUrl:z.string().url(),
 sourcePublishedAt:z.string().datetime().nullable(),
 createdAt:z.string().datetime(),
 category:incidentCategorySchema,
 priority:incidentPrioritySchema,
 relevanceScore:z.number().int().min(0).max(100),
 matchedTerms:z.array(z.string().max(80)),
 detectedState:nigerianStateSchema.nullable(),
 classificationReason:z.string().max(500),
 publisherName:z.string().min(1).max(160),
 displayName:z.string().min(1).max(160),
 isOfficial:z.boolean(),
 canonicalUrl:z.string().url(),
 licenceName:z.string().nullable(),
 attributionText:z.string().nullable()
}).strict();
export const ingestionQueueResponseSchema=z.object({data:z.array(ingestionQueueItemSchema)}).strict();
export type IngestionQueueItem=z.infer<typeof ingestionQueueItemSchema>;

export const ingestionModerationDecisionSchema=z.object({
 decision:z.enum(["publish","reject"]),
 reason:z.string().trim().min(5).max(1000),
 sourceIngestionItemIds:z.array(z.string().uuid()).min(1).max(5).optional(),
 verificationStatus:z.enum(["corroborated","officially_confirmed"]).optional(),
 category:incidentCategorySchema.optional(),
 state:nigerianStateSchema.optional(),
 locality:z.string().trim().max(120).nullable().optional(),
 occurredAt:z.string().datetime().optional(),
 rightsReviewNote:z.string().trim().min(20).max(1000).optional()
}).strict().superRefine((value,ctx)=>{
 if(value.decision==="publish"){
  if(!value.sourceIngestionItemIds?.length)ctx.addIssue({code:"custom",message:"Publication requires selected source items"});
  if(!value.verificationStatus)ctx.addIssue({code:"custom",message:"Publication requires a verification status"});
  if(!value.category||!value.state||!value.occurredAt)ctx.addIssue({code:"custom",message:"Publication requires a reviewed category, state and incident date"});
  if(!value.rightsReviewNote)ctx.addIssue({code:"custom",message:"Publication requires a documented rights review"});
  if(value.verificationStatus==="corroborated"&&(value.sourceIngestionItemIds?.length??0)<2)ctx.addIssue({code:"custom",message:"Corroboration requires at least two source items"});
 }else if(value.sourceIngestionItemIds||value.verificationStatus||value.category||value.state||value.occurredAt||value.rightsReviewNote){
  ctx.addIssue({code:"custom",message:"Rejection cannot include publication fields"});
 }
 const ids=value.sourceIngestionItemIds??[];if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"Source item IDs must be unique"});
});
export type IngestionModerationDecision=z.infer<typeof ingestionModerationDecisionSchema>;

export const liveStreamConsentSchema=z.object({privacyNoticeAccepted:z.literal(true),noChildrenOrVulnerablePeople:z.literal(true),noMedicalEmergencyBroadcast:z.literal(true),identifiablePeopleHaveConsented:z.literal(true),noExactLocationDisclosure:z.literal(true)}).strict();
export const liveStreamCreateSchema=z.object({title:z.string().trim().min(8).max(120),description:z.string().trim().min(20).max(500),state:nigerianStateSchema,locality:z.string().trim().max(120).nullable().optional(),consent:liveStreamConsentSchema}).strict();
export const liveStreamCreateResponseSchema=z.object({data:z.object({id:z.string().uuid(),status:z.literal("pending_review"),expiresAt:z.string().datetime()}).strict()}).strict();
export const liveStreamItemSchema=z.object({id:z.string().uuid(),title:z.string(),description:z.string(),state:nigerianStateSchema,locality:z.string().nullable(),startedAt:z.string().datetime(),expiresAt:z.string().datetime()}).strict();
export const liveStreamListResponseSchema=z.object({data:z.array(liveStreamItemSchema)}).strict();
export const liveStreamTokenRequestSchema=z.object({role:z.enum(["viewer","publisher"]).optional()}).strict();
export const liveStreamTokenResponseSchema=z.object({data:z.object({appId:z.string().min(1),channelName:z.string().min(1).max(64),uid:z.number().int().positive(),token:z.string().min(1),role:z.enum(["publisher","subscriber"]),expiresAt:z.string().datetime()}).strict()}).strict();
export const liveStreamModerationDecisionSchema=z.object({decision:z.enum(["approve","reject"]),reason:z.string().trim().min(5).max(1000)}).strict();
export const liveStreamReportSchema=z.object({reason:z.string().trim().min(20).max(1000)}).strict();
export const liveStreamReportDecisionSchema=z.object({decision:z.enum(["resolve","dismiss"]),reason:z.string().trim().min(5).max(1000)}).strict();
export type LiveStreamItem=z.infer<typeof liveStreamItemSchema>;

export const liveStreamOwnedItemSchema=z.object({id:z.string().uuid(),title:z.string(),description:z.string(),state:nigerianStateSchema,locality:z.string().nullable(),status:z.enum(["pending_review","approved","live","ended","rejected"]),startedAt:z.string().datetime().nullable(),expiresAt:z.string().datetime(),createdAt:z.string().datetime()}).strict();
export const liveStreamMineResponseSchema=z.object({data:z.array(liveStreamOwnedItemSchema)}).strict();
export type LiveStreamOwnedItem=z.infer<typeof liveStreamOwnedItemSchema>;

export const liveStreamModerationQueueItemSchema=z.object({id:z.string().uuid(),title:z.string(),description:z.string(),state:nigerianStateSchema,locality:z.string().nullable(),status:z.enum(["pending_review","live"]),createdAt:z.string().datetime(),expiresAt:z.string().datetime()}).strict();
export const liveStreamModerationQueueResponseSchema=z.object({data:z.array(liveStreamModerationQueueItemSchema)}).strict();
export type LiveStreamModerationQueueItem=z.infer<typeof liveStreamModerationQueueItemSchema>;
