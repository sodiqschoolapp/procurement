// Where a user lands after sign-in (edge-cases/system.md: "After login the user returns to the
// same page"). Only a path of this app is accepted, so a link can never send a person to
// another site after they typed their password.

/** The path to return to, or `/` when `next` is not a safe path of this app. */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  // `//host` and `/\host` are read by browsers as another site.
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  // A control character could split the address; a scheme has no place in a path.
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  const path = next.split(/[?#]/, 1)[0] ?? "";
  if (path === "/login" || path.startsWith("/login/")) return "/";
  return next;
}

/** The address of the sign-in page that returns to `path` afterwards. */
export function loginPathFor(path: string): string {
  const back = safeReturnPath(path);
  return back === "/" ? "/login" : `/login?next=${encodeURIComponent(back)}`;
}

/**
 * The request header in which the proxy hands the asked-for path to the app's layout, so a
 * session that ended while its cookie stayed still returns to the same page (spec review of
 * 0.10b). Set by the proxy only; a browser's own value is overwritten there.
 */
export const RETURN_PATH_HEADER = "x-return-path";
