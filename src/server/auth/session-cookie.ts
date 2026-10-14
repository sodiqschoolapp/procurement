import { createHmac, timingSafeEqual } from "node:crypto";

// The session cookie (developer-rules.md rule 13: "Cookies are httpOnly, secure and sameSite").
// Its value is the session token and an HMAC-SHA256 signature of it: `<token>.<signature>`.
// The token alone opens a session; the signature makes a guessed or copied-in token worthless
// without the secret.

export const SESSION_COOKIE = "procurement.session_token";
// Browsers keep a cookie of this name only when it is Secure, so in production it is the name.
export const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`;
export const SESSION_COOKIE_NAMES = [SECURE_SESSION_COOKIE, SESSION_COOKIE] as const;

/** 24 hours: a session ends 24 hours after sign-in (A8). */
export const SESSION_SECONDS = 24 * 60 * 60;

function signatureOf(token: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(token).digest();
}

/** The cookie value for a session token. */
export function signToken(token: string, secret: string): string {
  return `${token}.${signatureOf(token, secret).toString("base64url")}`;
}

/**
 * The session token in a cookie value, or `null` when the value is not one we signed. The
 * signature is compared in constant time (review of the plan of 0.6, correction 2).
 */
export function verifySignedToken(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1), "base64url");
  const expected = signatureOf(token, secret);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? token : null;
}

export type SessionCookie = {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

/**
 * The cookie that carries a session: httpOnly, SameSite=Lax, and Secure in production
 * (plan of 0.6, decision 9). It lasts as long as the session.
 */
export function sessionCookie(token: string, secret: string): SessionCookie {
  const secure = process.env.NODE_ENV === "production";
  return {
    name: secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE,
    value: signToken(token, secret),
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
