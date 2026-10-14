"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";

import { setBranchActiveAction } from "./actions";

// Deactivate or Activate a branch (04-catalogs.md rule 2: "Entries are deactivated instead";
// plan of 1.2, decision 6), behind the confirm dialog that states the result (11 rule 6).
// Deactivate is the quiet danger action of docs/design-system.md, "Lists".

export function BranchActiveButton({
  branch,
}: {
  branch: { id: string; name: string; isActive: boolean };
}) {
  const t = useTranslations("branches");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(setBranchActiveAction);
  const [open, setOpen] = useState(false);
  const deactivating = branch.isActive;

  async function confirm() {
    const result = await action.run({ id: branch.id, active: !deactivating });
    if (!result) return;
    setOpen(false);
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      router.refresh();
      return;
    }
    toast.success(t(deactivating ? "deactivated" : "activated"));
    router.refresh();
  }

  return (
    <>
      <Button
        variant={deactivating ? "destructive" : "secondary"}
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto"
      >
        {t(deactivating ? "deactivate" : "activate")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={action.pending}
        onConfirm={confirm}
        text={{
          title: t(deactivating ? "deactivateTitle" : "activateTitle", { name: branch.name }),
          result: t(deactivating ? "deactivateResult" : "activateResult"),
          confirm: t(deactivating ? "deactivate" : "activate"),
          danger: deactivating,
        }}
      />
    </>
  );
}
