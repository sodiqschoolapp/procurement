"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";

import { BRANCH_COOKIE, branchCookieOptions } from "@/features/catalog/branch-cookie";
import { LOCALES, LOCALE_COOKIE } from "@/i18n/locale";
import { getCurrentUser } from "@/server/auth/session";
import { SESSION_COOKIE_NAMES } from "@/server/auth/session-cookie";
import { signIn, signOut } from "@/server/auth/sign-in";

// The three actions of signing in and out (plan of 0.6, "Server actions and queries"). They run
// before a user is known or end the caller's own session only, so they have no authorize() and
// are outside the action wrapper (plan, Look first 3, confirmed by the review).

export type SignInFailure =
  { error: "invalid" | "wrong" | "unavailable" } | { error: "limit"; minutes: number };

/** Signs in and goes to the page the person asked for; returns why when it is refused. */
export async function signInAction(input: unknown): Promise<SignInFailure> {
  const result = await signIn(input);
  if (!result.ok) {
    return result.reason === "limit"
      ? { error: "limit", minutes: result.minutes }
      : { error: result.reason };
  }
  (await cookies()).set(result.cookie);
  redirect(result.returnPath);
}

/** Ends this device's session only, and goes to the sign-in page. */
export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await signOut(user.sessionToken);
  const store = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    if (!store.has(name)) continue;
    store.set(name, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }
  // The branch view is the person's own: the next person on this device starts on "All my
  // branches" (review of the plan of 0.10b, correction 3).
  if (store.has(BRANCH_COOKIE))
    store.set(BRANCH_COOKIE, "", { ...branchCookieOptions(), maxAge: 0 });
  redirect("/login");
}

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Keeps the language chosen on the sign-in page (decisions 0.5 item 1). */
export async function chooseLanguageAction(input: unknown): Promise<void> {
  const parsed = z.enum(LOCALES).safeParse(input);
  if (!parsed.success) return;
  (await cookies()).set(LOCALE_COOKIE, parsed.data, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
