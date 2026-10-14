import { getTranslations } from "next-intl/server";
import { connection } from "next/server";

import { shortCommit } from "@/server/commit";

export default async function StartPage() {
  // The commit is read when the page is asked for, not when it is built (0.16, plan decision 8).
  await connection();
  const commit = shortCommit();
  const t = await getTranslations("start");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-balance">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("notice")}</p>
        {commit && (
          <p className="mt-6 text-xs text-muted-foreground tabular-nums">
            {t("version")} {commit}
          </p>
        )}
      </div>
    </main>
  );
}
