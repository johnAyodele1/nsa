const uuid="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const moderatorDecision=new RegExp("^/v1/moderation/reports/"+uuid+"/decision$");
const ingestionDecision=new RegExp("^/v1/moderation/ingestion-items/"+uuid+"/decision$");
const liveOwnerAction=new RegExp("^/v1/live-sessions/"+uuid+"/(token|start|end|report)$");
const liveModerationAction=new RegExp("^/v1/live-sessions/moderation/"+uuid+"/(decision|end)$");
const liveReportDecision=new RegExp("^/v1/live-sessions/moderation/reports/"+uuid+"/decision$");
const privacyDecision=new RegExp("^/v1/privacy/moderation/requests/"+uuid+"/decision$");
const publicGetRoutes=new Set(["/v1/incidents","/v1/agencies","/v1/emergency-contacts"]);
const getRoutes=new Set([...publicGetRoutes,"/v1/reports/mine","/v1/moderation/reports","/v1/moderation/sources","/v1/moderation/ingestion-items","/v1/live-sessions/mine","/v1/live-sessions/moderation/queue","/v1/live-sessions/moderation/live","/v1/live-sessions/moderation/reports","/v1/privacy/requests/mine","/v1/privacy/moderation/requests","/v1/auth/admin/moderators"]);
const postRoutes=new Set(["/v1/reports","/v1/live-sessions","/v1/account/delete","/v1/privacy/requests","/v1/auth/admin/moderators","/v1/auth/admin/moderators/revoke"]);
export function isPublicProxyRoute(method:string,path:string):boolean{return method.toUpperCase()==="GET"&&publicGetRoutes.has(path);}
export function allowedGetQueryKeys(path:string):readonly string[]{if(path==="/v1/incidents")return ["limit","cursor","state","category","priority"];if(path==="/v1/emergency-contacts")return ["state"];return ["limit","cursor"];}
export function isAllowedProxyRoute(method:string,path:string):boolean{const verb=method.toUpperCase();if(verb==="GET")return getRoutes.has(path);if(verb!=="POST")return false;return postRoutes.has(path)||moderatorDecision.test(path)||ingestionDecision.test(path)||liveOwnerAction.test(path)||liveModerationAction.test(path)||liveReportDecision.test(path)||privacyDecision.test(path);}
