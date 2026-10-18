"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { StockMinimumResult } from "@/features/warehouse/actions/minimum";
import type { ActionResult } from "@/server/action-result";

// The minimum of one subtype in one branch, typed on Stock on hand or on the item card
// (09-warehouse.md, Low stock: "typed per subtype per branch, on the item card or in the Stock on
// hand list"; 04-catalogs.md rule 5; plan of 5.10). Shown only where the query offers it
// (`canSetMinimum`); the server asks again. Empty clears the minimum. The page passes its own
// `"use server"` export as `save`. Not a create, so no client key: the same value twice is the
// same state (decided item 7).

export function MinimumButton({
  branchId,
  variantId,
  itemName,
  minimum,
  unitShortName,
  save,
}: {
  branchId: string;
  variantId: string;
  itemName: string;
  /** The minimum as the formatter shows it, "" for none. */
  minimum: string;
  unitShortName: string;
  save: (input: unknown) => Promise<ActionResult<StockMinimumResult>>;
}) {
  const t = useTranslations("warehouse.minimum");
  const tAll = useTranslations();
  const router = useRouter();
  const fieldId = useId();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState(minimum);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setTyped(minimum);
    setError(null);
    setAsking(true);
  }

  async function run() {
    setPending(true);
    try {
      const answer = await save({ branchId, variantId, minQty: typed });
      if (answer.ok) {
        toast.success(t(answer.data.minimum === null ? "cleared" : "saved"));
        setAsking(false);
        return;
      }
      const field = answer.error.fields?.minQty;
      if (field) {
        setError(tAll(field));
        return;
      }
      toast.error(tAll(answer.error.messageKey));
      setAsking(false);
    } catch {
      toast.error(tAll("errors.network"));
      setAsking(false);
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="max-sm:size-11"
        onClick={open}
        aria-label={t("set", { item: itemName })}
        data-set-minimum={variantId}
      >
        <Icon name="edit" size={18} />
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        text={{ title: t("title", { item: itemName }), result: t("result"), confirm: t("save") }}
        onConfirm={() => void run()}
      >
        <Field
          id={fieldId}
          label={t("field", { unit: unitShortName })}
          error={error}
          className="mt-4"
        >
          <Input
            value={typed}
            inputMode="decimal"
            maxLength={40}
            disabled={pending}
            data-minimum-input
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}
