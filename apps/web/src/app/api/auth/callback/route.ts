import {createRemoteJWKSet,jwtVerify} from "jose";
import {NextRequest,NextResponse} from "next/server";
import {createWebSession,SESSION_COOKIE,CSRF_COOKIE,sessionCookieOptions,csrfCookieOptions} from "../../../../server/session";
type Metadata={issuer:string;token_endpoint:string;jwks_uri:string};
export async function GET(request:NextRequest){
 const origin=process.env.WEB_PUBLIC_ORIGIN??request.nextUrl.origin;
 const fail=NextResponse.redirect(new URL("/?authError=signin_failed",origin));
 const state=request.nextUrl.searchParams.get("state"),code=request.nextUrl.searchParams.get("code"),saved=request.cookies.get("nsa_oidc_state")?.value,nonce=request.cookies.get("nsa_oidc_nonce")?.value,verifier=request.cookies.get("nsa_oidc_verifier")?.value;
 if(!state||!code||state!==saved||!nonce||!verifier)return fail;
 try{
  const issuer=process.env.OIDC_ISSUER_URL!,clientId=process.env.NEXT_PUBLIC_OIDC_CLIENT_ID!;
  const metadataResponse=await fetch(new URL(".well-known/openid-configuration",issuer.replace(/\/$/,"")+"/"),{cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!metadataResponse.ok)throw new Error("OIDC discovery failed");
  const metadata=await metadataResponse.json() as Metadata;
  if(metadata.issuer!==issuer||new URL(metadata.token_endpoint).protocol!=="https:"||new URL(metadata.jwks_uri).protocol!=="https:")throw new Error("Invalid OIDC metadata");
  const redirectUri=new URL("/api/auth/callback",origin).toString();
  const form=new URLSearchParams({grant_type:"authorization_code",client_id:clientId,code,redirect_uri:redirectUri,code_verifier:verifier});
  if(process.env.OIDC_AUDIENCE)form.set("audience",process.env.OIDC_AUDIENCE);
  const tokenResponse=await fetch(metadata.token_endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form,cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(!tokenResponse.ok)throw new Error("OIDC token exchange failed");
  const tokens=await tokenResponse.json() as {access_token?:string;id_token?:string;expires_in?:number;token_type?:string};
  if(!tokens.access_token||!tokens.id_token||tokens.token_type?.toLowerCase()!=="bearer")throw new Error("Incomplete OIDC token response");
  const verified=await jwtVerify(tokens.id_token,createRemoteJWKSet(new URL(metadata.jwks_uri)),{issuer,audience:clientId,algorithms:["RS256","ES256"]});
  if(verified.payload.nonce!==nonce||typeof verified.payload.sub!=="string")throw new Error("OIDC nonce/subject validation failed");
  const rawTtl=Number(tokens.expires_in??3600);const ttl=Number.isFinite(rawTtl)?Math.min(Math.max(rawTtl,60),8*60*60):3600;
  const session=await createWebSession(verified.payload.sub,tokens.access_token,new Date(Date.now()+ttl*1000));
  const response=NextResponse.redirect(new URL("/",origin));
  response.cookies.set(SESSION_COOKIE,session.id,sessionCookieOptions);response.cookies.set(CSRF_COOKIE,session.csrf,csrfCookieOptions);
  for(const name of ["nsa_oidc_state","nsa_oidc_nonce","nsa_oidc_verifier"])response.cookies.set(name,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/auth",maxAge:0});
  return response;
 }catch(error){console.error("OIDC callback failed",error);return fail;}
}
