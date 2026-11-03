"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
type User={id:string;email:string;role:"member"|"moderator"|"admin"};
type AuthValue={ready:boolean;configured:boolean;authenticated:boolean;user:User|null;csrfToken:string|null;error:string|null;signIn:()=>void;signOut:()=>Promise<void>;refresh:()=>Promise<void>};
const AuthContext=createContext<AuthValue>({ready:false,configured:false,authenticated:false,user:null,csrfToken:null,error:null,signIn:()=>{},signOut:async()=>{},refresh:async()=>{}});
export function useNsaAuth(){return useContext(AuthContext);}
export function Providers({children}:{children:ReactNode}){
 const [ready,setReady]=useState(false),[configured,setConfigured]=useState(false),[authenticated,setAuthenticated]=useState(false),[user,setUser]=useState<User|null>(null),[csrfToken,setCsrfToken]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const refresh=useCallback(async()=>{const response=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin"});if(!response.ok)throw new Error("Session status unavailable");const data=await response.json() as {configured:boolean;authenticated:boolean;user:User|null;csrfToken:string|null};setConfigured(data.configured);setAuthenticated(data.authenticated);setUser(data.user);setCsrfToken(data.csrfToken);setError(null);},[]);
 useEffect(()=>{let active=true;void refresh().catch(()=>{if(active)setError("Authentication status could not be checked.");}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[refresh]);
 const signIn=useCallback(()=>{window.location.assign("/login");},[]);
 const signOut=useCallback(async()=>{if(!csrfToken)throw new Error("Security token missing. Refresh and try again.");const response=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"x-csrf-token":csrfToken}});if(!response.ok)throw new Error("Sign-out could not be completed.");setAuthenticated(false);setUser(null);setCsrfToken(null);},[csrfToken]);
 const value=useMemo<AuthValue>(()=>({ready,configured,authenticated,user,csrfToken,error,signIn,signOut,refresh}),[ready,configured,authenticated,user,csrfToken,error,signIn,signOut,refresh]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
