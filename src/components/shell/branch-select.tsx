"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { chooseBranchAction } from "@/app/(app)/branch-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { hasUnsavedChanges } from "@/components/unsaved-changes-guard";
import { Select } from "@/components/ui/select";
import { useAction } from "@/components/use-action";

// The branch switcher of the top bar (11-screens-and-ux.md rule 1: "the default is 'All my
// branches'"). It is disabled at once while the choice is saved (rule 4); success re-renders the
// page and the select shows the choice; an error goes to a toast and the old choice comes back.
// While a form on the page has unsaved changes the switch asks first, as leaving does
// (.claude/rules/ui.md, one branch-switch path; plan of 5.4): the page's forms are keyed by the
// branch, so the old branch's record leaves with the switch.

export type BranchOption = { id: string; code: string; name: string; isActive: boolean };

export function BranchSelect({
  branches,
  current,
}: {
  branches: readonly BranchOption[];
  current: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const action = useAction(chooseBranchAction);
  const [value, setValue] = useState(current ?? "all");
  const [asking, setAsking] = useState<string | null>(null);

  async function choose(chosen: string) {
    const before = value;
    setValue(chosen);
    const result = await action.run({ branch: chosen });
    if (!result) return;
    if (result.ok) {
      router.refresh();
      return;
    }
    setValue(before);
    toast.error(t(result.error.messageKey));
  }

  return (
    <div className="min-w-0">
      <label htmlFor="branch" className="sr-only">
        {t("branch.label")}
      </label>
      <Select
        id="branch"
        value={value}
        disabled={action.pending}
        aria-busy={action.pending || undefined}
        className="w-56 max-w-full"
        onChange={(event) => {
          const chosen = event.target.value;
          if (hasUnsavedChanges()) setAsking(chosen);
          else void choose(chosen);
        }}
      >
        <option value="all">{t("branch.all")}</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {t("branch.option", { code: branch.code, name: branch.name })}
            {branch.isActive ? null : ` ${t("branch.inactive")}`}
          </option>
        ))}
      </Select>
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        text={{
          title: t("unsavedChanges.title"),
          result: t("unsavedChanges.result"),
          confirm: t("branch.switchAnyway"),
          danger: true,
        }}
        onConfirm={() => {
          const chosen = asking!;
          setAsking(null);
          void choose(chosen);
        }}
      />
    </div>
  );
}
