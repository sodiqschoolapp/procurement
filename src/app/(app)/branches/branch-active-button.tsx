"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import type { ActionFailure } from "@/server/action-result";

import { setBranchActiveAction } from "./actions";

// Deactivate or Activate a branch (04-catalogs.md rule 2: "Entries are deactivated instead";
// plan of 1.2, decision 6), behind the confirm dialog that states the result (11 rule 6).
// Deactivate is the quiet danger action of docs/design-system.md, "Lists". A refused
// deactivation says what blocks it, with each count (edge-cases/requests-and-approval.md, "The
// Head wants to close a branch"; plan of 5.12).

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

  /** The block on closing, with its counts (plan of 5.12, decided items 1 and 2); else null. */
  function blocked(error: ActionFailure): string | null {
    const counts = error.available ?? {};
    const reasons = [
      error.fields?.orders ? t("blockedOrders", { count: Number(counts.orders) }) : null,
      error.fields?.stock ? t("blockedStock", { count: Number(counts.stock) }) : null,
      // Plan of 7.1, decided item 4.
      error.fields?.transfers ? t("blockedTransfers", { count: Number(counts.transfers) }) : null,
    ].filter((reason) => reason !== null);
    const [first, second, third] = reasons;
    if (first === undefined) return null;
    const joined = third
      ? t("blockedThree", { first, second: second!, third })
      : second
        ? t("blockedAnd", { first, second })
        : first;
    return t("blocked", { reasons: joined });
  }

  async function confirm() {
    const result = await action.run({ id: branch.id, active: !deactivating });
    if (!result) return;
    setOpen(false);
    if (!result.ok) {
      toast.error(blocked(result.error) ?? tAll(result.error.messageKey));
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
