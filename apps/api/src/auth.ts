// Authentication is implemented by local-auth.ts using email/password accounts and revocable database sessions.
export {createLocalAuthMiddleware,createAuthRouter} from "./local-auth.js";
