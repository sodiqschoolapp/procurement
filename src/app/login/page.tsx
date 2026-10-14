import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@/server/auth/return-path";
import { getCurrentUser } from "@/server/auth/session";
import { RETURN_PATH_MAX } from "@/server/auth/sign-in-input";

import { BrandPanel } from "./brand-panel";
import { LanguageSelect } from "./language-select";
import { LoginForm } from "./login-form";
import { ThemeButton } from "./theme-button";

/**
 * The page to return to, checked here already: a link that is not a safe path of this app, or
 * one too long for the form, signs in to the start page instead of blocking the form.
 */
function returnPathOf(next: string | string[] | undefined): string | undefined {
  if (typeof next !== "string" || next.length > RETURN_PATH_MAX) return undefined;
  const path = safeReturnPath(next);
  return path === "/" ? undefined : path;
}

// The sign-in page (11-screens-and-ux.md: Login `/login`, All), a brand moment of
// docs/design-system.md: on the left the horizontal colour logo (the on-dark one in the dark
// theme), the language select and the theme button, a Bitter title, two fields 48 high and a
// large primary button the full width of the form; on the right, from 640 px on, the navy panel.
// No "Forgot your password?" link (A8: the Head renews passwords). A signed-in person who opens
// it goes to the start page.
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
    <main className="flex min-h-dvh bg-card text-card-foreground">
      <div className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-12 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Image
            src="/brand/sodiq-logo-horizontal.svg"
            alt={t("logo")}
            width={195}
            height={31}
            unoptimized
            priority
            className="h-[31px] w-auto dark:hidden"
          />
          <Image
            src="/brand/sodiq-logo-horizontal-on-dark.svg"
            alt={t("logo")}
            width={195}
            height={31}
            unoptimized
            priority
            className="hidden h-[31px] w-auto dark:block"
          />
          <div className="flex items-center gap-2">
            <LanguageSelect current={locale} />
            <ThemeButton />
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <h1 className="font-slab text-[32px] leading-[38px] font-bold sm:text-[40px] sm:leading-[44px]">
              {t("title")}
            </h1>
            <LoginForm returnPath={returnPathOf(next)} />
          </div>
        </div>
      </div>
      <BrandPanel className="hidden w-[44%] max-w-[720px] sm:flex" />
    </main>
  );
}
