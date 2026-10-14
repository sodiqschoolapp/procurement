import { getTranslations } from "next-intl/server";
import { connection } from "next/server";

import { signOutAction } from "@/app/login/actions";
import { getCurrentUser } from "@/server/auth/session";
import { shortCommit } from "@/server/commit";

// The placeholder start page, open without signing in until task 0.10 makes `/` the home page
// per role (plan of 0.6, decision 14: CI's container step reads the commit from it).
export default async function StartPage() {
  // The commit is read when the page is asked for, not when it is built (0.16, plan decision 8).
  await connection();
  const commit = shortCommit();
  const user = await getCurrentUser();
  const t = await getTranslations();

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-balance">{t("start.title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("start.notice")}</p>
        {user && (
          <form action={signOutAction} className="mt-6 flex flex-col items-center gap-3">
            <p>{t("session.signedInAs", { name: user.fullName })}</p>
            <button
              type="submit"
              className="h-11 rounded-lg bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 sm:h-10"
            >
              {t("session.signOut")}
            </button>
          </form>
        )}
        {commit && (
          <p className="mt-6 text-xs text-muted-foreground tabular-nums">
            {t("start.version")} {commit}
          </p>
        )}
      </div>
    </main>
  );
}
