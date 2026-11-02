import "dotenv/config";
import {Pool} from "pg";
import {runIngestionCycle} from "./worker.js";
const connectionString=process.env.WORKER_DATABASE_URL;
if(!connectionString)throw new Error("WORKER_DATABASE_URL is required; the worker must not use the API database credentials");
const pool=new Pool({connectionString,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,application_name:"nsa-ingestion-worker"});
let closing=false;let running=false;
async function cycle(){if(closing||running)return;running=true;try{const inserted=await runIngestionCycle(pool);if(inserted>0)console.info("Ingestion cycle completed",{inserted});}catch(error){console.error("Ingestion cycle failed",error);}finally{running=false;}}
void cycle();
const timer=setInterval(()=>void cycle(),30000);timer.unref();
async function shutdown(signal:string){if(closing)return;closing=true;clearInterval(timer);console.info("Worker shutting down",{signal});await pool.end();process.exit(0);}
process.on("SIGINT",()=>void shutdown("SIGINT"));process.on("SIGTERM",()=>void shutdown("SIGTERM"));
