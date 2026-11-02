import {NextRequest,NextResponse} from "next/server";
import {currentWebSession,verifyCsrf} from "../../../../server/session";
type Context={params:Promise<{path:string[]}>};
async function handle(request:NextRequest,context:Context){
 try{
  const session=await currentWebSession();if(!session)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(request.method!=="GET"&&!verifyCsrf(request,session))return NextResponse.json({error:"CSRF_REJECTED"},{status:403});
  const {path}=await context.params;if(!path.length||path[0]!=="v1"||path.some(segment=>segment==="."||segment===".."||segment.includes("/")||segment.includes("\\")))return NextResponse.json({error:"INVALID_PROXY_PATH"},{status:404});
  const base=process.env.API_INTERNAL_URL??"http://127.0.0.1:4000";const target=new URL(path.map(encodeURIComponent).join("/"),base.endsWith("/")?base:base+"/");target.search=request.nextUrl.search;
  const headers=new Headers({authorization:"Bearer "+session.accessToken,accept:"application/json"});const contentType=request.headers.get("content-type");if(contentType)headers.set("content-type",contentType);
  const init:RequestInit={method:request.method,headers,cache:"no-store",redirect:"manual"};if(request.method!=="GET"&&request.method!=="HEAD")init.body=await request.arrayBuffer();
  const upstream=await fetch(target,init),responseHeaders=new Headers();const type=upstream.headers.get("content-type");if(type)responseHeaders.set("content-type",type);responseHeaders.set("cache-control","no-store");
  return new NextResponse(upstream.body,{status:upstream.status,headers:responseHeaders});
 }catch(error){console.error("BFF proxy failed",error);return NextResponse.json({error:"UPSTREAM_UNAVAILABLE"},{status:502});}
}
export const GET=handle;export const POST=handle;
