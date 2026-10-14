"use client";

import { useTranslations } from "next-intl";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

// A new password, shown to the Head once (A8: "a new password is shown to the Head at that moment
// only"; plan of 1.3, decision 10). It lives in this page's memory only: the server never returns
// it, and it is gone when the Head leaves the page.

export function ShownPassword({ username, password }: { username: string; password: string }) {
  const t = useTranslations("users");

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success(t("copied"));
    } catch {
      // No clipboard (an http address or a refused permission): the password stays readable.
    }
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-6 text-card-foreground"
    >
      <h2 className="text-[17px] leading-6 font-bold">{t("shownTitle", { username })}</h2>
      <p className="text-sm leading-5 text-muted-foreground">{t("shownText")}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <output
          data-testid="shown-password"
          className="rounded-md bg-muted px-3 py-2 text-[17px] leading-6 break-all select-all"
        >
          {password}
        </output>
        <Button variant="secondary" onClick={copy} className="w-full sm:w-auto">
          {t("copy")}
        </Button>
      </div>
    </div>
  );
}
