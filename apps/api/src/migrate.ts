import dotenv from "dotenv";
import {readdir,readFile} from "node:fs/promises";
import {Pool} from "pg";
import {fileURLToPath,pathToFileURL} from "node:url";

dotenv.config({path:fileURLToPath(new URL("../../../.env",import.meta.url))});
const migrationsDirectory=fileURLToPath(new URL("../../../database/migrations/",import.meta.url));
export async function applyMigrations(pool:Pool,directory=migrationsDirectory):Promise<void>{
 const client=await pool.connect();
 let lockAcquired=false;
 let migratorRoleActive=false;
 try{
  await client.query("SELECT pg_advisory_lock(hashtext($1)::bigint)",["nsa:schema-migrations"]);
  lockAcquired=true;
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
  const files=(await readdir(directory)).filter(file=>/^\d+.*\.sql$/.test(file)).sort();
  if(files.length===0)throw new Error(`No SQL migrations found in ${directory}`);
  const schemaOwnerMigrations=new Set(["0011_add_incident_categories.sql","0012_incident_relevance_and_priority.sql","0013_local_email_auth.sql","0014_auth_session_cleanup.sql","0015_moderator_invite_audit_order.sql","0016_secure_moderator_invites.sql","0017_moderator_invite_claim.sql"]);
  for(const file of files){
   if(file>='0006_privacy_erasure.sql'&&!migratorRoleActive){await client.query('SET ROLE nsa_migrator');migratorRoleActive=true;}
   const existing=await client.query("SELECT 1 FROM schema_migrations WHERE version=$1",[file]);
   if(existing.rowCount)continue;
   const raw=await readFile(`${directory}/${file}`,"utf8");
   const sql=raw.replace(/^\s*BEGIN\s*;\s*/i,"").replace(/\s*COMMIT\s*;\s*$/i,"").trim();
   if(!sql)throw new Error(`Migration ${file} is empty`);
   const runAsSchemaOwner=schemaOwnerMigrations.has(file)&&migratorRoleActive;
   if(runAsSchemaOwner)await client.query("RESET ROLE");
   await client.query("BEGIN");
   try{
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(version) VALUES($1)",[file]);
    await client.query("COMMIT");
    console.info(`Applied migration ${file}`);
   }catch(error){await client.query("ROLLBACK");throw error;}
   finally{if(runAsSchemaOwner)await client.query("SET ROLE nsa_migrator");}
  }
 }finally{
  if(lockAcquired){try{await client.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)",["nsa:schema-migrations"]);}catch(error){console.error("Failed to release migration lock",error);}}
  if(migratorRoleActive){try{await client.query('RESET ROLE');}catch(error){console.error('Failed to reset migration role',error);}}
  client.release();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const connectionString=process.env.MIGRATOR_DATABASE_URL??process.env.DATABASE_URL;
 if(!connectionString)throw new Error("MIGRATOR_DATABASE_URL or DATABASE_URL is required to run database migrations against the NSA PostgreSQL database.");
 const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:5000,statement_timeout:30000,application_name:"nsa-migrations"});
 try{await applyMigrations(pool);}catch(error){console.error("Database migration failed",error);process.exitCode=1;}finally{await pool.end();}
}
