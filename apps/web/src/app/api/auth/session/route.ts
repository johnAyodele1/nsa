import {NextRequest,NextResponse} from "next/server";
import {CSRF_COOKIE,currentWebSession,resolveInternalApiUrl,resolveWebSessionDatabaseUrl} from "../../../../server/session";
export async function GET(request:NextRequest){
 const key=process.env.WEB_SESSION_ENCRYPTION_KEY;let keyValid=false;try{keyValid=Boolean(key&&Buffer.from(key,"base64").length===32);}catch{}
 const apiBase=resolveInternalApiUrl();
 const configured=Boolean(apiBase&&resolveWebSessionDatabaseUrl()&&keyValid);
 try{
  const session=await currentWebSession();if(!session)return NextResponse.json({configured,authenticated:false,user:null,csrfToken:null},{headers:{"cache-control":"no-store"}});
  if(!apiBase)return NextResponse.json({configured:false,authenticated:false,user:null,csrfToken:null},{headers:{"cache-control":"no-store"}});
  const response=await fetch(new URL("/v1/auth/me",apiBase),{headers:{authorization:"Bearer "+session.accessToken,accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
  if(!response.ok)return NextResponse.json({configured,authenticated:false,user:null,csrfToken:null},{headers:{"cache-control":"no-store"}});
  const result=await response.json() as {data?:{id:string;email:string;role:"member"|"moderator"|"admin"}};
  return NextResponse.json({configured,authenticated:Boolean(result.data),user:result.data??null,csrfToken:request.cookies.get(CSRF_COOKIE)?.value??null},{headers:{"cache-control":"no-store"}});
 }catch{return NextResponse.json({configured,authenticated:false,user:null,csrfToken:null},{headers:{"cache-control":"no-store"}});}
}
