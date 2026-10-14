import { type NextRequest, NextResponse } from "next/server";

import { RETURN_PATH_HEADER, loginPathFor } from "@/server/auth/return-path";
import { SESSION_COOKIE_NAMES } from "@/server/auth/session-cookie";

// Next.js 16's proxy (the former middleware). A request without a session cookie to a page of
// the app goes to the sign-in page, which brings the person back afterwards (edge-cases/system.md:
// "After login the user returns to the same page"). Only the cookie's presence is read here; the
// real check is requireUser() on the server, which reads the session itself.

/** The paths open without signing in: sign-in and the health check. `/` is the home page (0.10b). */
const OPEN_PATHS = new Set(["/login", "/health"]);

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();
  if (SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))) {
    // The layout of the signed-in pages reads the path from here when the session has ended.
    const headers = new Headers(request.headers);
    headers.set(RETURN_PATH_HEADER, `${pathname}${search}`);
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url));
}

export const config = {
  // Every path except Next.js's own files, the files of public/, and the upload and download
  // routes of /files: they answer a signed-out visitor with 401 themselves, as a redirect is no
  // answer for an image or an upload, and an upload body must not pass the proxy's 10 MB body
  // buffer (plan of 0.12, decision 7, Look first).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|files(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|webmanifest)$).*)",
  ],
};
