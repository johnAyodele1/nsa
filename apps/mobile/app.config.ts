import type {ConfigContext,ExpoConfig} from "expo/config";
try{
 process.loadEnvFile("../../.env");
}catch(error){
 if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
}
export default ({config}:ConfigContext):ExpoConfig=>({...config,name:config.name??"Nigeria Security Alerts",slug:config.slug??"nigeria-security-alerts"});
