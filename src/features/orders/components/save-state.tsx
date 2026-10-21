"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "retrying" }
  | { kind: "notSaved" }
  | { kind: "error"; text: string };

/**
 * The save state of a row (05 Drafts 3: "Saved"; 11 rule 4: errors say what to do next; rule 7:
 * "No connection. Trying again…"; review of the plan of 2.6, correction 2: "Not saved" offers
 * "Try again", which sends the failed save once more).
 */
export function SaveStateText({ state, onTryAgain }: { state: SaveState; onTryAgain(): void }) {
  const t = useTranslations("orders");
  return (
    <span className="flex flex-col items-start gap-1">
      <span
        className={cn(
          "block py-2.5 text-small",
          state.kind === "saved" && "text-success",
          (state.kind === "error" || state.kind === "notSaved") && "text-destructive",
          (state.kind === "saving" || state.kind === "retrying") && "text-muted-foreground",
        )}
      >
        {state.kind === "saving" && t("save.saving")}
        {state.kind === "saved" && t("save.saved")}
        {state.kind === "retrying" && t("save.retrying")}
        {state.kind === "notSaved" && t("save.failed")}
        {state.kind === "error" && state.text}
      </span>
      {state.kind === "notSaved" && (
        <Button type="button" variant="secondary" size="sm" onClick={onTryAgain}>
          {t("save.tryAgain")}
        </Button>
      )}
    </span>
  );
}
