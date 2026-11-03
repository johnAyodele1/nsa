import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({error:"EXTERNAL_AUTH_DISABLED"},{status:410,headers:{"cache-control":"no-store"}});}
