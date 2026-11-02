import {createRemoteJWKSet,jwtVerify} from "jose";
import {NextRequest,NextResponse} from "next/server";
import {createWebSession,SESSION_COOKIE,CSRF_COOKIE,sessionCookieOptions,csrfCookieOptions} from "../../../../server/session";
type Metadata={issuer:string;token_endpoint:string;jwks_uri:string};
const temporaryCookies=["nsa_oidc_state","nsa_oidc_nonce","nsa_oidc_verifier"];
function failed(origin:string){const response=NextResponse.redirect(new URL("/?authError=signin_failed",origin));response.headers.set("cache-control","no-store");for(const name of temporaryCookies)response.cookies.set(name,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/auth",maxAge:0});return response;}
export async function GET(request:NextRequest){
 if(process.env.NODE_ENV==="production"&&!process.env.WEB_PUBLIC_ORIGIN)return NextResponse.json({error:"WEB_ORIGIN_NOT_CONFIGURED"},{status:503});
 const origin=process.env.WEB_PUBLIC_ORIGIN??request.nextUrl.origin;
 try{
  const state=request.nextUrl.searchParams.get("state"),code=request.nextUrl.searchParams.get("code"),saved=request.cookies.get("nsa_oidc_state")?.value,nonce=request.cookies.get("nsa_oidc_nonce")?.value,verifier=request.cookies.get("nsa_oidc_verifier")?.value;
  if(request.nextUrl.searchParams.has("error")||!state||state.length>256||!code||code.length>4096||state!==saved||!nonce||!verifier)return failed(origin);
  const issuer=process.env.OIDC_ISSUER_URL,clientId=process.env.NEXT_PUBLIC_OIDC_CLIENT_ID,jwksUri=process.env.OIDC_JWKS_URL;if(!issuer||!clientId||!jwksUri)return failed(origin);
  const issuerUrl=new URL(issuer),webOrigin=new URL(origin);if(issuerUrl.protocol!=="https:"||(process.env.NODE_ENV==="production"&&webOrigin.protocol!=="https:"))return failed(origin);
  const discoveryUrl=new URL(".well-known/openid-configuration",issuer.replace(/\/$/,"")+"/");
  const metadataResponse=await fetch(discoveryUrl,{headers:{accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});if(!metadataResponse.ok)throw new Error("OIDC discovery failed");
  const metadata=await metadataResponse.json() as Metadata;
  if(metadata.issuer!==issuer||new URL(metadata.token_endpoint).protocol!=="https:"||new URL(metadata.jwks_uri).protocol!=="https:"||metadata.jwks_uri!==jwksUri)throw new Error("OIDC metadata mismatch");
  const redirectUri=new URL("/api/auth/callback",webOrigin).toString(),form=new URLSearchParams({grant_type:"authorization_code",client_id:clientId,code,redirect_uri:redirectUri,code_verifier:verifier});
  if(process.env.OIDC_AUDIENCE)form.set("audience",process.env.OIDC_AUDIENCE);
  const tokenResponse=await fetch(metadata.token_endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body:form,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});if(!tokenResponse.ok)throw new Error("OIDC token exchange failed");
  const tokens=await tokenResponse.json() as {access_token?:unknown;id_token?:unknown;expires_in?:unknown;token_type?:unknown};
  if(typeof tokens.access_token!=="string"||tokens.access_token.length<20||tokens.access_token.length>8192||typeof tokens.id_token!=="string"||tokens.id_token.length>16384||tokens.token_type!=="Bearer"||typeof tokens.expires_in!=="number"||!Number.isFinite(tokens.expires_in)||tokens.expires_in<60)throw new Error("Invalid OIDC token response");
  const verified=await jwtVerify(tokens.id_token,createRemoteJWKSet(new URL(metadata.jwks_uri)),{issuer,audience:clientId,algorithms:["RS256","ES256"]});
  if(verified.payload.nonce!==nonce||typeof verified.payload.sub!=="string"||verified.payload.sub.length<1||verified.payload.sub.length>255)throw new Error("OIDC nonce/subject validation failed");
  const ttl=Math.min(tokens.expires_in,3600),expiresAt=new Date(Date.now()+ttl*1000),session=await createWebSession(verified.payload.sub,tokens.access_token,expiresAt);
  const response=NextResponse.redirect(new URL("/",webOrigin));response.headers.set("cache-control","no-store");
  response.cookies.set(SESSION_COOKIE,session.id,{...sessionCookieOptions,maxAge:ttl});response.cookies.set(CSRF_COOKIE,session.csrf,{...csrfCookieOptions,maxAge:ttl});
  for(const name of temporaryCookies)response.cookies.set(name,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/auth",maxAge:0});
  return response;
 }catch(error){console.error("OIDC callback failed",error);return failed(origin);}
}
