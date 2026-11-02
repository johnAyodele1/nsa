import type {AuthContext} from "../auth.js";
declare global {
 namespace Express {
  interface Locals {
   auth?:AuthContext;
   requestId?:string;
   moderator?:{id:string;role:"moderator"|"admin"};
  }
 }
}
export {};
