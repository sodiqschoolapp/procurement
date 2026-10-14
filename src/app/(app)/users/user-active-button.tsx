"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";

import { setUserActiveAction } from "./actions";

// Deactivate or Activate a user (04-catalogs.md rule 2; A8: deactivating signs them out), behind
// the confirm dialog that states the result (11 rule 6). Activating a Principal whose branch has
// another active Principal is the replacement (03 rule 3; plan of 1.3, Look first 3): the dialog
// names who is replaced. The last active Head and the Head's own account offer no Deactivate
// (03 rule 4; decision 9); the server refuses both too.

export function UserActiveButton({
  user,
  replaces,
}: {
  user: { id: string; fullName: string; isActive: boolean };
  /** The active Principal an activation would replace, or null. */
  replaces: { fullName: string } | null;
}) {
  const t = useTranslations("users");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(setUserActiveAction);
  const [open, setOpen] = useState(false);
  const deactivating = user.isActive;
  const replacing = !deactivating && replaces !== null;

  async function confirm() {
    const result = await action.run({
      id: user.id,
      active: !deactivating,
      replacePrincipal: replacing,
    });
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

  const names = { name: user.fullName, other: replaces?.fullName ?? "" };
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
          title: t(
            deactivating ? "deactivateTitle" : replacing ? "activateReplaceTitle" : "activateTitle",
            names,
          ),
          result: t(
            deactivating
              ? "deactivateResult"
              : replacing
                ? "activateReplaceResult"
                : "activateResult",
            names,
          ),
          confirm: t(deactivating ? "deactivate" : "activate"),
          danger: deactivating || replacing,
        }}
      />
    </>
  );
}
