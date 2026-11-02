"use client";
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
type AuthValue={ready:boolean;configured:boolean;authenticated:boolean;error:string|null;signIn:()=>void;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthValue>({ready:false,configured:false,authenticated:false,error:null,signIn:()=>{},signOut:async()=>{}});
export function useNsaAuth(){return useContext(AuthContext);}
export function Providers({children}:{children:ReactNode}){
 const [ready,setReady]=useState(false),[configured,setConfigured]=useState(false),[authenticated,setAuthenticated]=useState(false),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let mounted=true;void fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin"}).then(async response=>{if(!response.ok)throw new Error("Session status unavailable");return response.json() as Promise<{configured:boolean;authenticated:boolean}>;}).then(data=>{if(mounted){setConfigured(data.configured);setAuthenticated(data.authenticated);}}).catch(()=>{if(mounted)setError("Authentication status could not be checked.");}).finally(()=>{if(mounted)setReady(true);});return()=>{mounted=false;};},[]);
 const value=useMemo<AuthValue>(()=>({ready,configured,authenticated,error,signIn:()=>window.location.assign("/api/auth/login"),signOut:async()=>{await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});setAuthenticated(false);}}),[ready,configured,authenticated,error]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
