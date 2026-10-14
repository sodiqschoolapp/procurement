import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@/server/auth/return-path";
import { getCurrentUser } from "@/server/auth/session";
import { RETURN_PATH_MAX } from "@/server/auth/sign-in-input";

import { LanguageSelect } from "./language-select";
import { LoginForm } from "./login-form";

/**
 * The page to return to, checked here already: a link that is not a safe path of this app, or
 * one too long for the form, signs in to the start page instead of blocking the form.
 */
function returnPathOf(next: string | string[] | undefined): string | undefined {
  if (typeof next !== "string" || next.length > RETURN_PATH_MAX) return undefined;
  const path = safeReturnPath(next);
  return path === "/" ? undefined : path;
}

// The sign-in page (11-screens-and-ux.md: Login `/login`, All). Plain until task 0.10 gives it
// the brand look of docs/design-system.md; no "Forgot your password?" link (A8: the Head renews
// passwords). A signed-in person who opens it goes to the start page.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const t = await getTranslations("login");
  const locale = await getLocale();

  return (
    <main className="flex min-h-dvh justify-center p-4 sm:items-center sm:p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <LanguageSelect current={locale} />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <LoginForm returnPath={returnPathOf(next)} />
      </div>
    </main>
  );
}
