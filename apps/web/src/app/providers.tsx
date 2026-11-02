"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
type AuthValue={ready:boolean;configured:boolean;authenticated:boolean;csrfToken:string|null;error:string|null;signIn:()=>void;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthValue>({ready:false,configured:false,authenticated:false,csrfToken:null,error:null,signIn:()=>{},signOut:async()=>{}});
export function useNsaAuth(){return useContext(AuthContext);}
export function Providers({children}:{children:ReactNode}){
 const [ready,setReady]=useState(false),[configured,setConfigured]=useState(false),[authenticated,setAuthenticated]=useState(false),[csrfToken,setCsrfToken]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const refresh=useCallback(async(signal?:AbortSignal)=>{const response=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",...(signal?{signal}:{})});if(!response.ok)throw new Error("Session status unavailable");const data=await response.json() as {configured:boolean;authenticated:boolean;csrfToken:string|null};setConfigured(data.configured);setAuthenticated(data.authenticated);setCsrfToken(data.csrfToken);},[]);
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal).catch((reason:unknown)=>{if(!(reason instanceof Error&&reason.name==="AbortError"))setError("Authentication status could not be checked.");}).finally(()=>setReady(true));return()=>controller.abort();},[refresh]);
 const signIn=useCallback(()=>{window.location.assign("/api/auth/login");},[]);
 const signOut=useCallback(async()=>{if(!csrfToken)throw new Error("The security token is missing. Refresh and try again.");const response=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"x-csrf-token":csrfToken}});if(!response.ok)throw new Error("Sign-out could not be completed.");setAuthenticated(false);setCsrfToken(null);},[csrfToken]);
 const value=useMemo<AuthValue>(()=>({ready,configured,authenticated,csrfToken,error,signIn,signOut}),[ready,configured,authenticated,csrfToken,error,signIn,signOut]);return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
