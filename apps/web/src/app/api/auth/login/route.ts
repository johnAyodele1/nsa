import {createHash,randomBytes} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
export async function GET(request:NextRequest){
 const issuer=process.env.OIDC_ISSUER_URL,clientId=process.env.NEXT_PUBLIC_OIDC_CLIENT_ID;
 if(!issuer||!clientId)return NextResponse.json({error:"OIDC_NOT_CONFIGURED"},{status:503});
 const origin=process.env.WEB_PUBLIC_ORIGIN??request.nextUrl.origin;
 try{
  const base=new URL(issuer);if(base.protocol!=="https:")throw new Error("Issuer must use HTTPS");
  const discoveryUrl=new URL(".well-known/openid-configuration",base.toString().replace(/\/$/,"")+"/");
  const response=await fetch(discoveryUrl,{cache:"no-store",signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error("Discovery failed");
  const metadata=await response.json() as {issuer:string;authorization_endpoint:string};
  if(metadata.issuer!==issuer||new URL(metadata.authorization_endpoint).protocol!=="https:")throw new Error("Invalid issuer metadata");
  const state=randomBytes(32).toString("base64url"),nonce=randomBytes(32).toString("base64url"),verifier=randomBytes(48).toString("base64url");
  const challenge=createHash("sha256").update(verifier).digest("base64url"),redirectUri=new URL("/api/auth/callback",origin).toString();
  const url=new URL(metadata.authorization_endpoint);
  for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:"openid profile",state,nonce,code_challenge:challenge,code_challenge_method:"S256"}))url.searchParams.set(k,v);
  if(process.env.OIDC_AUDIENCE)url.searchParams.set("audience",process.env.OIDC_AUDIENCE);
  const next=NextResponse.redirect(url);
  for(const [name,value] of [["nsa_oidc_state",state],["nsa_oidc_nonce",nonce],["nsa_oidc_verifier",verifier]] as const)next.cookies.set(name,value,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/auth",maxAge:600});
  return next;
 }catch(error){console.error("OIDC login setup failed",error);return NextResponse.json({error:"OIDC_LOGIN_UNAVAILABLE"},{status:503});}
}
