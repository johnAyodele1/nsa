import {createRemoteJWKSet,jwtVerify} from "jose";
import type {RequestHandler} from "express";

export type AuthContext={subject:string};
type OidcConfig={issuer:string;jwksUrl:string;audience:string};

export function createOidcAuthMiddleware(config:OidcConfig):RequestHandler{
 const issuer=new URL(config.issuer);
 const jwksUrl=new URL(config.jwksUrl);
 if(issuer.protocol!=="https:"||jwksUrl.protocol!=="https:")throw new Error("OIDC issuer and JWKS endpoints must use HTTPS");
 if(!config.audience.trim())throw new Error("OIDC audience is required");
 const jwks=createRemoteJWKSet(jwksUrl);
 return async(req,res,next)=>{
  const authorization=req.header("authorization");
  if(!authorization?.startsWith("Bearer "))return res.status(401).json({error:"UNAUTHORIZED"});
  const token=authorization.slice("Bearer ".length).trim();
  if(!token||token.length>8192)return res.status(401).json({error:"UNAUTHORIZED"});
  try{
   const {payload}=await jwtVerify(token,jwks,{issuer:config.issuer,audience:config.audience,algorithms:["RS256","ES256"]});
   if(typeof payload.sub!=="string"||payload.sub.length===0||payload.sub.length>255)return res.status(401).json({error:"UNAUTHORIZED"});
   res.locals.auth={subject:payload.sub};
   return next();
  }catch{return res.status(401).json({error:"UNAUTHORIZED"});}
 };
}
