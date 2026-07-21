export {
  type AuthNext,
  type AuthNextConfig,
  type AuthResult,
  createAuthNext,
  type OnAuthenticated,
} from "./server.ts"
// Cookie naming/options helpers — so a product's BFF client reads the access
// cookie by the SAME derived name (`<prefix>_access`) instead of re-hardcoding it.
// (createRefreshMiddleware stays on the `/middleware` subpath: it's edge-runtime
// code kept out of the root/server import graph.)
export {
  authConfig,
  cookieNames,
  cookieOptions,
  DEFAULT_ACCESS_MAX_AGE,
  DEFAULT_REFRESH_MAX_AGE,
} from "./config.ts"
// The centralized, pre-wired-for-the-iedora-realm integration every product uses.
export {
  type Account,
  authClient,
  authNext,
  completeOAuth,
  forgotPassword,
  getAccessToken,
  getAccount,
  getClaims,
  login,
  logout,
  register,
  resetPassword,
} from "./integration.ts"
