"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { decideCountAction } from "@/app/(app)/warehouse/documents/[id]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { isMoveReason } from "@/domain/order-moves";
import type { WriteOffOutcome } from "@/domain/stock-documents";
import type { DocumentLine } from "@/features/warehouse/queries/document";

import { ReasonField } from "./reason-field";

// Approve and Refuse on a waiting count (09-warehouse.md, Other documents, Stock count: "the Head
// approves them as corrections"; 11-screens-and-ux.md rule 6: ask for confirmation, say what it
// covers and state the result; plan of 7.4). Shown only where getStockDocument() offers it
// (`canDecide`; Approve where `canApprove`); the server asks again under the lock. Approve sends the
// counted quantities on the screen: a Manager's save since then is refused as `conflict` and the
// page reloads (decided item 2). An item that moved since the start sends the count back, and the
// toast says how many. Refuse asks for a reason, which the Manager sees on the page (plan of
// 7.4c).

export function CountDecision({
  documentId,
  number,
  lines,
  canApprove,
  changes,
  fixed,
}: {
  documentId: string;
  number: string;
  lines: readonly DocumentLine[];
  canApprove: boolean;
  changes: number;
  /** Fixed at the bottom; false below the Head's own counting form, which has its own bar. */
  fixed: boolean;
}) {
  const t = useTranslations("warehouse.count.decision");
  const tAll = useTranslations();
  const router = useRouter();
  const [asking, setAsking] = useState<WriteOffOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  async function run(outcome: WriteOffOutcome) {
    setPending(true);
    try {
      const answer = await decideCountAction({
        documentId,
        outcome,
        reason: outcome === "REFUSE" ? reason : undefined,
        seen:
          outcome === "APPROVE"
            ? lines.map((line) => ({ lineId: line.id, countedQty: line.countedQty ?? "" }))
            : undefined,
      });
      if (answer.ok) {
        if (answer.data.outcome === "RECOUNT") {
          toast.error(t("recount", { count: answer.data.recount, number }));
        } else {
          toast.success(t(answer.data.outcome === "APPROVE" ? "approved" : "refused", { number }));
        }
        return;
      }
      toast.error(answer.error.code === "conflict" ? t("conflict") : tAll(answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      setAsking(null);
      setPending(false);
      router.refresh();
    }
  }

  return (
    <div
      data-count-decision
      className={cn(
        "flex flex-col-reverse gap-3 rounded-xl border-t border-border bg-card p-4 sm:flex-row sm:justify-end sm:p-6",
        fixed && "sticky bottom-0 z-10 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))]",
      )}
    >
      <Button
        variant="secondary"
        icon="block"
        className="max-sm:h-12"
        onClick={() => {
          setReason("");
          setAsking("REFUSE");
        }}
      >
        {t("refuse")}
      </Button>
      {canApprove ? (
        <Button icon="check_circle" className="max-sm:h-12" onClick={() => setAsking("APPROVE")}>
          {t("approve")}
        </Button>
      ) : null}
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => !open && !pending && setAsking(null)}
        pending={pending}
        confirmDisabled={asking === "REFUSE" && !isMoveReason(reason)}
        text={
          asking === "REFUSE"
            ? {
                title: t("refuseTitle", { number }),
                result: t("refuseResult", { number }),
                confirm: t("refuse"),
                danger: true,
              }
            : {
                title: t("approveTitle", { number }),
                result: t("approveResult", { count: changes }),
                confirm: t("approve"),
                danger: true,
              }
        }
        onConfirm={() => {
          if (asking) void run(asking);
        }}
      >
        {asking === "REFUSE" && (
          <ReasonField
            value={reason}
            onChange={setReason}
            disabled={pending}
            hint="warehouse.refuseReason.hint"
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
