"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import type { EntryKind } from "@/domain/catalogs";

import { setCatalogEntryActiveAction } from "./actions";
import { setDepartmentActiveAction } from "./departments/actions";
import { setProductActiveAction } from "./products/actions";
import { setSubtypeActiveAction } from "./products/[id]/subtypes/actions";

// Deactivate or Activate a catalog entry (04-catalogs.md rule 2: "Entries are deactivated
// instead"), behind the confirm dialog that states the result (11 rule 6). Deactivate is the
// quiet danger action of docs/design-system.md, "Lists". Departments (1.6), products (1.7) and
// subtypes (1.8) run their own action.

export function CatalogActiveButton({
  kind,
  entry,
}: {
  kind: EntryKind;
  entry: { id: string; name: string; isActive: boolean };
}) {
  const t = useTranslations("catalog");
  const tAll = useTranslations();
  const router = useRouter();
  const own = kind === "departments" || kind === "products" || kind === "subtypes";
  const action = useAction(
    kind === "departments"
      ? setDepartmentActiveAction
      : kind === "products"
        ? setProductActiveAction
        : kind === "subtypes"
          ? setSubtypeActiveAction
          : setCatalogEntryActiveAction,
  );
  const [open, setOpen] = useState(false);
  const deactivating = entry.isActive;

  async function confirm() {
    const input = { id: entry.id, active: !deactivating };
    const result = await action.run(own ? input : { catalog: kind, ...input });
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
          title: t(deactivating ? "deactivateTitle" : "activateTitle", { name: entry.name }),
          result: t(deactivating ? "deactivateResult" : "activateResult"),
          confirm: t(deactivating ? "deactivate" : "activate"),
          danger: deactivating,
        }}
      />
    </>
  );
}
