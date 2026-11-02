import "dotenv/config";
import {Pool} from "pg";
import {createApp} from "./app.js";
import {createOidcAuthMiddleware} from "./auth.js";
const port=Number(process.env.API_PORT??4000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("API_PORT must be a valid TCP port");
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.DATABASE_POOL_MAX??10),idleTimeoutMillis:30000,connectionTimeoutMillis:5000,statement_timeout:10000}):null;
const oidcConfig={issuer:process.env.OIDC_ISSUER_URL,jwksUrl:process.env.OIDC_JWKS_URL,audience:process.env.OIDC_AUDIENCE};
const oidcValues=Object.values(oidcConfig);
const hasPartialOidcConfig=oidcValues.some(Boolean)&&!oidcValues.every(Boolean);
if(hasPartialOidcConfig)throw new Error("Configure OIDC_ISSUER_URL, OIDC_JWKS_URL and OIDC_AUDIENCE together");
const authMiddleware=oidcValues.every(Boolean)?createOidcAuthMiddleware({issuer:oidcConfig.issuer!,jwksUrl:oidcConfig.jwksUrl!,audience:oidcConfig.audience!}):undefined;
const app=createApp({pool,authMiddleware,allowedOrigins:(process.env.CORS_ORIGINS??"http://localhost:3000,http://localhost:8081").split(",").map(x=>x.trim()).filter(Boolean)});
const server=app.listen(port,process.env.API_HOST??"0.0.0.0",()=>console.info(`NSA API listening on port ${port}`));
let closing=false;
function shutdown(signal:string){if(closing)return;closing=true;console.info(`Received ${signal}; shutting down`);server.close(async(error)=>{try{await pool?.end();}catch(e){console.error("Database shutdown failed",e);process.exitCode=1;}if(error){console.error(error);process.exitCode=1;}process.exit();});setTimeout(()=>{console.error("Graceful shutdown timed out");process.exit(1);},10000).unref();}
process.on("SIGINT",()=>shutdown("SIGINT"));process.on("SIGTERM",()=>shutdown("SIGTERM"));
