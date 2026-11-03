import dotenv from "dotenv";
import {fileURLToPath} from "node:url";
import {randomBytes,randomUUID,scrypt as scryptCallback} from "node:crypto";
import {promisify} from "node:util";
import {Pool} from "pg";
dotenv.config({path:fileURLToPath(new URL("../../../.env",import.meta.url))});
const scrypt=promisify(scryptCallback);
const databaseUrl=process.env.MIGRATOR_DATABASE_URL;
const email=process.env.NSA_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password=process.env.NSA_SUPER_ADMIN_PASSWORD;
if(!databaseUrl)throw new Error("MIGRATOR_DATABASE_URL is required for the one-time super-admin bootstrap");
if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("NSA_SUPER_ADMIN_EMAIL must be a valid email address");
if(!password||password.length<16||password.length>128)throw new Error("NSA_SUPER_ADMIN_PASSWORD must contain 16 to 128 characters");
const pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000,application_name:"nsa-super-admin-bootstrap"});
const salt=randomBytes(16);
const derived=await scrypt(password,salt,64) as Buffer;
const passwordHash="scrypt$16384$8$1$"+salt.toString("base64url")+"$"+derived.toString("base64url");
const client=await pool.connect();
try{
 await client.query("BEGIN");
 await client.query("SELECT pg_advisory_xact_lock(hashtext('nsa-super-admin-bootstrap'))");
 const admins=await client.query("SELECT 1 FROM app_users WHERE role='admin' AND is_active IS TRUE LIMIT 1");
 if(admins.rowCount)throw new Error("A super-admin already exists; refusing to create or replace another one");
 const existing=await client.query("SELECT 1 FROM app_users WHERE lower(email)=$1",[email]);
 if(existing.rowCount)throw new Error("That email already belongs to an account; bootstrap requires a new email");
 await client.query("INSERT INTO app_users(auth_subject,email,password_hash,role) VALUES($1,$2,$3,'admin')",["local:"+randomUUID(),email,passwordHash]);
 await client.query("COMMIT");
 console.info("NSA super-admin created. Sign in using NSA_SUPER_ADMIN_EMAIL and the configured password.");
}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
finally{client.release();await pool.end();}
