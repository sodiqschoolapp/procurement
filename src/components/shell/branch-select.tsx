"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { chooseBranchAction } from "@/app/(app)/branch-actions";
import { toast } from "@/components/toast";
import { Select } from "@/components/ui/select";
import { useAction } from "@/components/use-action";

// The branch switcher of the top bar (11-screens-and-ux.md rule 1: "the default is 'All my
// branches'"). It is disabled at once while the choice is saved (rule 4); success re-renders the
// page and the select shows the choice; an error goes to a toast and the old choice comes back.

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
        onChange={async (event) => {
          const before = value;
          const chosen = event.target.value;
          setValue(chosen);
          const result = await action.run({ branch: chosen });
          if (!result) return;
          if (result.ok) {
            router.refresh();
            return;
          }
          setValue(before);
          toast.error(t(result.error.messageKey));
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
    </div>
  );
}
