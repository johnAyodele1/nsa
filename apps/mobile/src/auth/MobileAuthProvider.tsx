import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type {AuthRequestConfig,DiscoveryDocument} from "expo-auth-session";
WebBrowser.maybeCompleteAuthSession();
const TOKEN_KEY="nsa.access-token.v1";
type StoredToken={accessToken:string;expiresAt:number};
type AuthValue={ready:boolean;configured:boolean;authenticated:boolean;accessToken:string|null;error:string|null;signIn:()=>Promise<void>;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthValue>({ready:false,configured:false,authenticated:false,accessToken:null,error:null,signIn:async()=>{},signOut:async()=>{}});
export function useNsaMobileAuth(){return useContext(AuthContext);}
export function MobileAuthProvider({children}:{children:ReactNode}){
 const issuer=process.env.EXPO_PUBLIC_OIDC_ISSUER_URL??"";
 const clientId=process.env.EXPO_PUBLIC_OIDC_CLIENT_ID??"";
 const audience=process.env.EXPO_PUBLIC_OIDC_AUDIENCE??"";
 const configured=Boolean(issuer&&clientId&&audience);
 const [discovery,setDiscovery]=useState<DiscoveryDocument|null>(null);
 const [discoveryReady,setDiscoveryReady]=useState(false);
 const [accessToken,setAccessToken]=useState<string|null>(null);
 const [expiresAt,setExpiresAt]=useState(0);
 const [storageReady,setStorageReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const redirectUri=useMemo(()=>AuthSession.makeRedirectUri({scheme:"nsa",path:"auth/callback"}),[]);
 const extraParams=useMemo<Record<string,string>>(()=>audience?{audience}:{},[audience]);
 const requestConfig=useMemo<AuthRequestConfig>(()=>({clientId:clientId||"not-configured",redirectUri,responseType:AuthSession.ResponseType.Code,scopes:["openid","profile"],usePKCE:true,extraParams}),[clientId,redirectUri,extraParams]);
 const [request,response,promptAsync]=AuthSession.useAuthRequest(requestConfig,discovery);
 useEffect(()=>{
  let mounted=true;
  if(!configured){setDiscoveryReady(true);return()=>{mounted=false;};}
  void (async()=>{try{if(new URL(issuer).protocol!=="https:")throw new Error("The identity provider must use HTTPS.");const result=await AuthSession.fetchDiscoveryAsync(issuer);if(!result.authorizationEndpoint||!result.tokenEndpoint)throw new Error("The identity provider does not expose required OIDC endpoints.");if(mounted)setDiscovery(result);}
   catch(e){if(mounted)setError(e instanceof Error?e.message:"Could not load identity provider metadata.");}
   finally{if(mounted)setDiscoveryReady(true);}
  })();
  return()=>{mounted=false;};
 },[configured,issuer]);
 useEffect(()=>{
  let mounted=true;
  void (async()=>{try{const raw=await SecureStore.getItemAsync(TOKEN_KEY);if(!raw)return;const parsed=JSON.parse(raw) as StoredToken;if(typeof parsed.accessToken!=="string"||typeof parsed.expiresAt!=="number"||parsed.expiresAt<=Date.now()){await SecureStore.deleteItemAsync(TOKEN_KEY);return;}if(mounted){setAccessToken(parsed.accessToken);setExpiresAt(parsed.expiresAt);}}
   catch{await SecureStore.deleteItemAsync(TOKEN_KEY).catch(()=>undefined);if(mounted)setError("Saved sign-in expired or could not be read. Please sign in again.");}
   finally{if(mounted)setStorageReady(true);}
  })();
  return()=>{mounted=false;};
 },[]);
 useEffect(()=>{
  if(!response)return;
  if(response.type==="error"){setError(response.error?.message??"Sign-in was not completed.");setBusy(false);return;}
  if(response.type!=="success")return;
  const code=response.params.code;const codeVerifier=request?.codeVerifier;
  if(!code||!codeVerifier||!discovery?.tokenEndpoint){setError("The secure sign-in request could not be completed.");setBusy(false);return;}
  let active=true;
  void (async()=>{try{
   const token=await AuthSession.exchangeCodeAsync({clientId,code,redirectUri,extraParams:{code_verifier:codeVerifier}},discovery);
   if(!token.accessToken||!token.expiresIn||token.expiresIn<=0)throw new Error("The identity provider returned an invalid access token.");
   const stored:StoredToken={accessToken:token.accessToken,expiresAt:Date.now()+token.expiresIn*1000};
   await SecureStore.setItemAsync(TOKEN_KEY,JSON.stringify(stored),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
   if(active){setAccessToken(stored.accessToken);setExpiresAt(stored.expiresAt);setError(null);}
  }catch(e){if(active)setError(e instanceof Error?e.message:"Sign-in failed. Please try again.");}
  finally{if(active)setBusy(false);}
  })();
  return()=>{active=false;};
 },[response,request,discovery,clientId,redirectUri]);
 useEffect(()=>{
  if(!accessToken)return;
  const remaining=expiresAt-Date.now();
  if(remaining<=0){setAccessToken(null);setExpiresAt(0);void SecureStore.deleteItemAsync(TOKEN_KEY);return;}
  const timer=setTimeout(()=>{setAccessToken(null);setExpiresAt(0);void SecureStore.deleteItemAsync(TOKEN_KEY);},remaining);
  return()=>clearTimeout(timer);
 },[accessToken,expiresAt]);
 const signIn=useCallback(async()=>{if(!configured||!discovery||!request)throw new Error("Mobile sign-in is not configured yet.");setError(null);setBusy(true);try{const result=await promptAsync();if(result.type==="cancel"||result.type==="dismiss")setBusy(false);else if(result.type==="error"){setError(result.error?.message??"Sign-in failed.");setBusy(false);}}catch(e){setError(e instanceof Error?e.message:"Could not open the sign-in page.");setBusy(false);}},[configured,discovery,request,promptAsync]);
 const signOut=useCallback(async()=>{setBusy(true);try{await SecureStore.deleteItemAsync(TOKEN_KEY);}finally{setAccessToken(null);setExpiresAt(0);setError(null);setBusy(false);}},[]);
 const ready=discoveryReady&&storageReady;
 const value=useMemo<AuthValue>(()=>({ready,configured,authenticated:Boolean(accessToken&&expiresAt>Date.now()),accessToken:accessToken&&expiresAt>Date.now()?accessToken:null,error,signIn,signOut}),[ready,configured,accessToken,expiresAt,error,signIn,signOut]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
