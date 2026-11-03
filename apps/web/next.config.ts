import type {NextConfig} from "next";
try{
 process.loadEnvFile("../../.env");
}catch(error){
 if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
}
const nextConfig:NextConfig={};
export default nextConfig;
