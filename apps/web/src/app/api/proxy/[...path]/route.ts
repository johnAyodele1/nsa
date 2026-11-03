import {NextRequest,NextResponse} from "next/server";
import {currentWebSession,verifyCsrf} from "../../../../server/session";
import {allowedGetQueryKeys,isAllowedProxyRoute,isPublicProxyRoute} from "../../../../server/proxy-policy";
type Context={params:Promise<{path:string[]}>};
async function handle(request:NextRequest,context:Context){
 try{
  const {path}=await context.params;
  if(!Array.isArray(path)||path.length<2||path[0]!=="v1"||path.some(segment=>!/^[a-zA-Z0-9_-]+$/.test(segment)))return NextResponse.json({error:"NOT_FOUND"},{status:404});
  const apiPath="/"+path.join("/");if(!isAllowedProxyRoute(request.method,apiPath))return NextResponse.json({error:"NOT_FOUND"},{status:404});
  const publicRead=isPublicProxyRoute(request.method,apiPath);
  const session=publicRead?null:await currentWebSession();if(!publicRead&&!session)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(request.method==="POST"&&(!session||!verifyCsrf(request,session)))return NextResponse.json({error:"CSRF_VALIDATION_FAILED"},{status:403});
  const base=process.env.API_INTERNAL_URL;if(!base)return NextResponse.json({error:"API_NOT_CONFIGURED"},{status:503});
  const baseUrl=new URL(base);if(process.env.NODE_ENV==="production"&&baseUrl.protocol!=="https:")return NextResponse.json({error:"API_HTTPS_REQUIRED"},{status:503});
  if(baseUrl.username||baseUrl.password||!["http:","https:"].includes(baseUrl.protocol))return NextResponse.json({error:"INVALID_API_CONFIGURATION"},{status:503});
  const target=new URL(apiPath,base.endsWith("/")?base:base+"/");
  if(request.method==="GET"){
   for(const key of allowedGetQueryKeys(apiPath)){const value=request.nextUrl.searchParams.get(key);if(value)target.searchParams.set(key,value);}
  }
  const headers=new Headers({accept:"application/json"});if(session)headers.set("authorization","Bearer "+session.accessToken);let body:string|undefined;
  if(request.method==="POST"){const type=request.headers.get("content-type")??"";if(!type.toLowerCase().startsWith("application/json"))return NextResponse.json({error:"JSON_REQUIRED"},{status:415});const length=Number(request.headers.get("content-length")??0);if(length>65536)return NextResponse.json({error:"BODY_TOO_LARGE"},{status:413});body=await request.text();if(Buffer.byteLength(body,"utf8")>65536)return NextResponse.json({error:"BODY_TOO_LARGE"},{status:413});headers.set("content-type","application/json");}
  const requestInit:RequestInit={method:request.method,headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000),...(body===undefined?{}:{body})};const upstream=await fetch(target,requestInit);const responseBody=await upstream.arrayBuffer();
  return new Response(responseBody,{status:upstream.status,headers:{"content-type":upstream.headers.get("content-type")??"application/json","cache-control":"no-store"}});
 }catch(error){console.error("BFF API proxy failed",error);return NextResponse.json({error:"API_UNAVAILABLE"},{status:502,headers:{"cache-control":"no-store"}});}
}
export async function GET(request:NextRequest,context:Context){return handle(request,context);}
export async function POST(request:NextRequest,context:Context){return handle(request,context);}
