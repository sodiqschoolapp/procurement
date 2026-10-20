"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cancelTransferAction } from "@/app/(app)/warehouse/documents/[id]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { isMoveReason } from "@/domain/order-moves";

import { ReasonField } from "./reason-field";

// Cancel on an In-transit transfer's page (09-warehouse.md, Other documents, Transfer: "Until then
// the sender or the Head can cancel the transfer with a reason, and the stock goes back to the
// sender at the cost it left with"; 11-screens-and-ux.md rule 6: ask for confirmation and state the
// result; plan of 7.4c). Shown only where getStockDocument() offers it (`canCancel`); the server
// asks again under the lock. The confirm button is the danger kind: a cancel cannot be undone. Not
// a create, so no client key: a second press, or a receipt first, is refused as `wrong_status`.

export function CancelTransferButton({
  documentId,
  number,
  fromBranch,
  toBranch,
}: {
  documentId: string;
  number: string;
  fromBranch: string;
  toBranch: string;
}) {
  const t = useTranslations("warehouse.cancelTransfer");
  const tAll = useTranslations();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  async function run() {
    setPending(true);
    try {
      const answer = await cancelTransferAction({ documentId, reason });
      if (answer.ok) {
        toast.success(t("done", { number }));
        return;
      }
      toast.error(tAll(answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      setAsking(false);
      setPending(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        className="max-sm:h-12"
        onClick={() => {
          setReason("");
          setAsking(true);
        }}
        data-cancel-transfer={documentId}
      >
        {t("button")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => !pending && setAsking(open)}
        pending={pending}
        confirmDisabled={!isMoveReason(reason)}
        text={{
          title: t("title", { number }),
          result: t("result", { from: fromBranch, to: toBranch }),
          confirm: t("button"),
          danger: true,
        }}
        onConfirm={() => void run()}
      >
        <ReasonField
          value={reason}
          onChange={setReason}
          disabled={pending}
          hint="warehouse.reverse.reasonHint"
        />
      </ConfirmDialog>
    </>
  );
}
