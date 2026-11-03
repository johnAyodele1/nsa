// Authentication is implemented by local-auth.ts using email/password accounts and revocable database sessions.
export {createLocalAuthMiddleware,createAuthRouter} from "./local-auth.js";
export type {LocalAuthContext as AuthContext} from "./local-auth.js";
