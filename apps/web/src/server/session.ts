import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {cookies} from "next/headers";
import {Pool} from "pg";
export const SESSION_COOKIE="nsa_session";
export const CSRF_COOKIE="nsa_csrf";
export type WebSession={auth_subject:string;access_token_ciphertext:Buffer;access_token_iv:Buffer;access_token_tag:Buffer;csrf_token_hash:string;expires_at:Date};
let pool:Pool|undefined;
function database(){const url=process.env.WEB_SESSION_DATABASE_URL;if(!url)throw new Error("WEB_SESSION_DATABASE_URL is required");pool??=new Pool({connectionString:url,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:5000,application_name:"nsa-web-session"});return pool;}
function encryptionKey(){const value=process.env.WEB_SESSION_ENCRYPTION_KEY;if(!value)throw new Error("WEB_SESSION_ENCRYPTION_KEY is required");const key=Buffer.from(value,"base64");if(key.length!==32)throw new Error("WEB_SESSION_ENCRYPTION_KEY must be base64 for 32 bytes");return key;}
export const sha256=(value:string)=>createHash("sha256").update(value).digest("hex");
export function encryptAccessToken(token:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv),ciphertext=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);return {ciphertext,iv,tag:cipher.getAuthTag()};}
export function decryptAccessToken(session:WebSession){const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),session.access_token_iv);decipher.setAuthTag(session.access_token_tag);return Buffer.concat([decipher.update(session.access_token_ciphertext),decipher.final()]).toString("utf8");}
export async function createWebSession(subject:string,token:string,expiresAt:Date){const id=randomBytes(32).toString("base64url"),csrf=randomBytes(32).toString("base64url"),encrypted=encryptAccessToken(token);await database().query("INSERT INTO web_sessions(session_id_hash,auth_subject,access_token_ciphertext,access_token_iv,access_token_tag,csrf_token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[sha256(id),subject,encrypted.ciphertext,encrypted.iv,encrypted.tag,sha256(csrf),expiresAt]);return {id,csrf};}
export async function getWebSession(id:string|undefined){if(!id||id.length>128)return null;const hash=sha256(id),r=await database().query("SELECT auth_subject,access_token_ciphertext,access_token_iv,access_token_tag,csrf_token_hash,expires_at FROM web_sessions WHERE session_id_hash=$1 AND expires_at>now()",[hash]);const row=r.rows[0] as WebSession|undefined;if(!row)return null;await database().query("UPDATE web_sessions SET last_seen_at=now() WHERE session_id_hash=$1",[hash]);return {...row,accessToken:decryptAccessToken(row)};}
export async function deleteWebSession(id:string|undefined){if(id)await database().query("DELETE FROM web_sessions WHERE session_id_hash=$1",[sha256(id)]);}
export async function currentWebSession(){const store=await cookies();return getWebSession(store.get(SESSION_COOKIE)?.value);}
function cookieValue(request:Request,name:string){for(const part of (request.headers.get("cookie")??"").split(";")){const [key,...value]=part.trim().split("=");if(key===name)return decodeURIComponent(value.join("="));}return undefined;}
export function verifyCsrf(request:Request,session:WebSession){const origin=request.headers.get("origin"),expected=process.env.WEB_PUBLIC_ORIGIN??new URL(request.url).origin,cookie=cookieValue(request,CSRF_COOKIE),header=request.headers.get("x-csrf-token");if(!origin||origin!==expected||!cookie||!header||cookie!==header)return false;const a=Buffer.from(sha256(header)),b=Buffer.from(session.csrf_token_hash);return a.length===b.length&&timingSafeEqual(a,b);}
const secure=process.env.NODE_ENV==="production";
export const sessionCookieOptions={httpOnly:true,secure,sameSite:"lax" as const,path:"/",maxAge:60*60*8};
export const csrfCookieOptions={httpOnly:false,secure,sameSite:"lax" as const,path:"/",maxAge:60*60*8};
