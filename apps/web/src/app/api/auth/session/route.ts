import {NextRequest,NextResponse} from "next/server";
import {CSRF_COOKIE,currentWebSession} from "../../../../server/session";
export async function GET(request:NextRequest){
 const key=process.env.WEB_SESSION_ENCRYPTION_KEY;let keyValid=false;try{keyValid=Boolean(key&&Buffer.from(key,"base64").length===32);}catch{}
 let originValid=false;try{const origin=new URL(process.env.WEB_PUBLIC_ORIGIN??"");originValid=origin.origin===process.env.WEB_PUBLIC_ORIGIN&&(process.env.NODE_ENV!=="production"||origin.protocol==="https:");}catch{}
 const configured=Boolean(process.env.OIDC_ISSUER_URL&&process.env.NEXT_PUBLIC_OIDC_CLIENT_ID&&process.env.WEB_SESSION_DATABASE_URL&&keyValid&&originValid&&process.env.API_INTERNAL_URL&&process.env.OIDC_JWKS_URL&&process.env.OIDC_AUDIENCE);
 try{const session=await currentWebSession();return NextResponse.json({configured,authenticated:Boolean(session),csrfToken:session?request.cookies.get(CSRF_COOKIE)?.value??null:null},{headers:{"cache-control":"no-store"}});}
 catch{return NextResponse.json({configured:false,authenticated:false,csrfToken:null},{headers:{"cache-control":"no-store"}});}
}
