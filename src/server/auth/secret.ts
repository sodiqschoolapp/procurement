// The one secret that signs the session cookie, for both the login library (auth.ts) and our
// own cookie reader (session-cookie.ts), so the two can never disagree (review of the plan of
// 0.6, correction 1). It lives in the local .env and in the DigitalOcean dashboard only.

// The library's own public default (better-auth/dist/utils/constants.mjs). Anyone can read it,
// so it is used only outside production, where nothing real is signed in.
const DEVELOPMENT_SECRET = "better-auth-secret-12345678901234567890";

/**
 * The secret, or `null` in production when `BETTER_AUTH_SECRET` is not set: then every cookie
 * reads as signed out and sign-in is refused, and the public default is never used.
 */
export function authSecret(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? null : DEVELOPMENT_SECRET;
}
