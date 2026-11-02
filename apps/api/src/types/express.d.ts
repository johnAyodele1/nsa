import type {AuthContext} from "../auth.js";
declare global { namespace Express { interface Locals { auth?: AuthContext; } } }
export {};
