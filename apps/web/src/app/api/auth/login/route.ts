import {NextRequest,NextResponse} from "next/server";
import {assertWebSessionStoreReady,createWebSession,SESSION_COOKIE,CSRF_COOKIE,sessionCookieOptions,csrfCookieOptions,resolveInternalApiUrl} from "../../../../server/session";
const credentialsSchema={email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/,password:(value:string)=>value.length>=12&&value.length<=128};
export async function POST(request:NextRequest){
 const origin=request.headers.get("origin"),expected=process.env.WEB_PUBLIC_ORIGIN??request.nextUrl.origin;
 if(!origin||origin!==expected)return NextResponse.json({error:"ORIGIN_VALIDATION_FAILED"},{status:403});
 const base=resolveInternalApiUrl();if(!base)return NextResponse.json({error:"API_NOT_CONFIGURED"},{status:503});
 try{
  const body=await request.json() as {email?:unknown;password?:unknown};
  if(typeof body.email!=="string"||typeof body.password!=="string"||body.email.length>254||!credentialsSchema.email.test(body.email)||!credentialsSchema.password(body.password))return NextResponse.json({error:"INVALID_CREDENTIALS"},{status:400});
  try{await assertWebSessionStoreReady();}catch(error){console.error("Web session store is not ready",error);return NextResponse.json({error:"WEB_SESSION_NOT_READY"},{status:503,headers:{"cache-control":"no-store"}});}
  const api=new URL("/v1/auth/login",base);if(process.env.NODE_ENV==="production"&&api.protocol!=="https:")return NextResponse.json({error:"API_HTTPS_REQUIRED"},{status:503});
  const upstream=await fetch(api,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({email:body.email,password:body.password}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  const result=await upstream.json() as {error?:string;data?:{user?:{authSubject?:string};accessToken?:string;expiresAt?:string}};
  if(!upstream.ok||!result.data?.user?.authSubject||!result.data.accessToken||!result.data.expiresAt)return NextResponse.json({error:result.error??"SIGN_IN_FAILED"},{status:upstream.status||502,headers:{"cache-control":"no-store"}});
  const expiresAt=new Date(result.data.expiresAt);if(!Number.isFinite(expiresAt.getTime())||expiresAt<=new Date())return NextResponse.json({error:"INVALID_SESSION"},{status:502});
  const session=await createWebSession(result.data.user.authSubject,result.data.accessToken,expiresAt);
  const response=NextResponse.json({ok:true},{headers:{"cache-control":"no-store"}});
  const maxAge=Math.floor((expiresAt.getTime()-Date.now())/1000);
  response.cookies.set(SESSION_COOKIE,session.id,{...sessionCookieOptions,maxAge});response.cookies.set(CSRF_COOKIE,session.csrf,{...csrfCookieOptions,maxAge});
  return response;
 }catch(error){console.error("Local web sign-in failed",error);return NextResponse.json({error:"SIGN_IN_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
}
