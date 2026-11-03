import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import * as SecureStore from "expo-secure-store";
const TOKEN_KEY="nsa.access-token.v2";
const API=(process.env.EXPO_PUBLIC_API_URL??"").replace(/\/$/,"");
type StoredToken={accessToken:string;expiresAt:number};
type AuthValue={ready:boolean;configured:boolean;authenticated:boolean;accessToken:string|null;error:string|null;signIn:(email:string,password:string)=>Promise<void>;register:(email:string,password:string,inviteCode?:string)=>Promise<void>;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthValue>({ready:false,configured:false,authenticated:false,accessToken:null,error:null,signIn:async()=>{},register:async()=>{},signOut:async()=>{}});
export function useNsaMobileAuth(){return useContext(AuthContext);}
export function MobileAuthProvider({children}:{children:ReactNode}){
 const configured=Boolean(API);
 const [accessToken,setAccessToken]=useState<string|null>(null);
 const [expiresAt,setExpiresAt]=useState(0);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{let mounted=true;void (async()=>{try{await SecureStore.deleteItemAsync("nsa.access-token.v1").catch(()=>undefined);const raw=await SecureStore.getItemAsync(TOKEN_KEY);if(!raw)return;const parsed=JSON.parse(raw) as StoredToken;if(typeof parsed.accessToken!=="string"||typeof parsed.expiresAt!=="number"||parsed.expiresAt<=Date.now()){await SecureStore.deleteItemAsync(TOKEN_KEY);return;}if(mounted){setAccessToken(parsed.accessToken);setExpiresAt(parsed.expiresAt);}}catch{await SecureStore.deleteItemAsync(TOKEN_KEY).catch(()=>undefined);if(mounted)setError("Saved sign-in could not be read. Please sign in again.");}finally{if(mounted)setReady(true);}})();return()=>{mounted=false;};},[]);
 const authenticate=useCallback(async(path:"login"|"register",email:string,password:string,inviteCode?:string)=>{if(!configured)throw new Error("Set EXPO_PUBLIC_API_URL to the NSA API address.");if(!__DEV__&&new URL(API).protocol!=="https:")throw new Error("The NSA API must use HTTPS in production.");setError(null);const response=await fetch(API+"/v1/auth/"+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password,...(path==="register"&&inviteCode?{moderatorInviteToken:inviteCode}:{})})});const body=await response.json() as {error?:string;data?:{accessToken:string;expiresAt:string}};if(!response.ok||!body.data?.accessToken||!body.data.expiresAt)throw new Error(body.error??"Authentication failed.");const expiry=Date.parse(body.data.expiresAt);if(!Number.isFinite(expiry)||expiry<=Date.now())throw new Error("The server returned an invalid session.");const stored={accessToken:body.data.accessToken,expiresAt:expiry};await SecureStore.setItemAsync(TOKEN_KEY,JSON.stringify(stored),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});setAccessToken(stored.accessToken);setExpiresAt(stored.expiresAt);},[configured]);
 const signIn=useCallback((email:string,password:string)=>authenticate("login",email,password),[authenticate]);
 const register=useCallback((email:string,password:string,inviteCode?:string)=>authenticate("register",email,password,inviteCode),[authenticate]);
 const signOut=useCallback(async()=>{try{if(accessToken)await fetch(API+"/v1/auth/logout",{method:"POST",headers:{authorization:"Bearer "+accessToken}});}finally{await SecureStore.deleteItemAsync(TOKEN_KEY);setAccessToken(null);setExpiresAt(0);setError(null);}},[accessToken]);
 useEffect(()=>{if(!accessToken)return;const remaining=expiresAt-Date.now();if(remaining<=0){void signOut();return;}const timer=setTimeout(()=>void signOut(),remaining);return()=>clearTimeout(timer);},[accessToken,expiresAt,signOut]);
 const value=useMemo<AuthValue>(()=>({ready,configured,authenticated:Boolean(accessToken&&expiresAt>Date.now()),accessToken:accessToken&&expiresAt>Date.now()?accessToken:null,error,signIn,register,signOut}),[ready,configured,accessToken,expiresAt,error,signIn,register,signOut]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
