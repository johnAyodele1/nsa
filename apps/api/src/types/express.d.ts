import type {AuthContext} from "../auth.js";
declare global {
 namespace Express {
  interface Locals {
   auth?:AuthContext;
   requestId?:string;
   moderator?:{id:string;role:"moderator"|"admin"};
   user?:{id:string;role:"member"|"moderator"|"admin"};
  }
 }
}
export {};
