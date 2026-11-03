import {NextRequest,NextResponse} from "next/server";
import {deleteWebSession,SESSION_COOKIE,CSRF_COOKIE,currentWebSession,sessionCookieOptions,csrfCookieOptions,verifyCsrf,verifyLogoutCsrf} from "../../../../server/session";
export async function POST(request:NextRequest){
 try{
  const session=await currentWebSession();if(session?!verifyCsrf(request,session):!verifyLogoutCsrf(request))return NextResponse.json({error:"CSRF_VALIDATION_FAILED"},{status:403});
  if(session&&process.env.API_INTERNAL_URL){try{await fetch(new URL("/v1/auth/logout",process.env.API_INTERNAL_URL),{method:"POST",headers:{authorization:"Bearer "+session.accessToken},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});}catch{throw new Error("Server session revocation failed");}}
  await deleteWebSession(request.cookies.get(SESSION_COOKIE)?.value);
  const response=NextResponse.json({ok:true},{headers:{"cache-control":"no-store"}});
  response.cookies.set(SESSION_COOKIE,"",{...sessionCookieOptions,maxAge:0});response.cookies.set(CSRF_COOKIE,"",{...csrfCookieOptions,maxAge:0});return response;
 }catch(error){console.error("Local sign-out failed",error);return NextResponse.json({error:"LOGOUT_FAILED"},{status:503});}
}
