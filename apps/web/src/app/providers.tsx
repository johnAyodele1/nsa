"use client";
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import {UserManager,WebStorageStateStore,type User} from "oidc-client-ts";
type AuthValue={ready:boolean;configured:boolean;authenticated:boolean;accessToken:string|null;error:string|null;signIn:()=>Promise<void>;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthValue>({ready:false,configured:false,authenticated:false,accessToken:null,error:null,signIn:async()=>{},signOut:async()=>{}});
export function useNsaAuth(){return useContext(AuthContext);}
export function Providers({children}:{children:ReactNode}){
 const [manager,setManager]=useState<UserManager|null>(null);const [user,setUser]=useState<User|null>(null);const [ready,setReady]=useState(false);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  const issuer=process.env.NEXT_PUBLIC_OIDC_ISSUER_URL;const clientId=process.env.NEXT_PUBLIC_OIDC_CLIENT_ID;const audience=process.env.NEXT_PUBLIC_OIDC_AUDIENCE;
  if(!issuer||!clientId){setReady(true);return;}let mounted=true;let oidc:UserManager;
  try{if(new URL(issuer).protocol!=="https:")throw new Error("The identity provider must use HTTPS");oidc=new UserManager({authority:issuer,client_id:clientId,redirect_uri:window.location.origin+"/",post_logout_redirect_uri:window.location.origin+"/",response_type:"code",scope:"openid profile",automaticSilentRenew:false,monitorSession:false,loadUserInfo:false,extraQueryParams:audience?{audience}:{},userStore:new WebStorageStateStore({store:window.sessionStorage}),stateStore:new WebStorageStateStore({store:window.sessionStorage})});}
  catch(e){setError(e instanceof Error?e.message:"Authentication configuration is invalid");setReady(true);return;}
  const onLoaded=(next:User|null)=>{if(mounted)setUser(next);};const onUnloaded=()=>{if(mounted)setUser(null);};const onExpired=()=>{if(mounted)setUser(null);};
  oidc.events.addUserLoaded(onLoaded);oidc.events.addUserUnloaded(onUnloaded);oidc.events.addAccessTokenExpired(onExpired);setManager(oidc);
  void (async()=>{try{if(window.location.search.includes("code=")||window.location.search.includes("error=")){const callbackUser=await oidc.signinRedirectCallback();onLoaded(callbackUser);}else onLoaded(await oidc.getUser());}catch{setError("Sign-in could not be completed. Try signing in again.");}finally{window.history.replaceState({},document.title,window.location.pathname);if(mounted)setReady(true);}})();
  return()=>{mounted=false;oidc.events.removeUserLoaded(onLoaded);oidc.events.removeUserUnloaded(onUnloaded);oidc.events.removeAccessTokenExpired(onExpired);};
 },[]);
 const value=useMemo<AuthValue>(()=>({ready,configured:Boolean(manager&&process.env.NEXT_PUBLIC_OIDC_AUDIENCE),authenticated:Boolean(user&&!user.expired),accessToken:user&&!user.expired?user.access_token:null,error,signIn:async()=>{if(!manager)throw new Error("OIDC is not configured");await manager.signinRedirect();},signOut:async()=>{if(manager)await manager.signoutRedirect();}}),[ready,manager,user,error]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}