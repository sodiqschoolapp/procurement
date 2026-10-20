"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { decideWriteOffAction } from "@/app/(app)/warehouse/documents/[id]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { isMoveReason } from "@/domain/order-moves";
import type { WriteOffOutcome } from "@/domain/stock-documents";
import type { DocumentLine } from "@/features/warehouse/queries/document";
import { useFormatters } from "@/i18n/use-formatters";

import { ReasonField } from "./reason-field";

// Approve and Refuse on a waiting write-off (09-warehouse.md, Other documents, Write-off: "Stock
// changes only after the Head approves"; 11-screens-and-ux.md rule 6: ask for confirmation, say
// what it covers and state the result; plan of 5.11). Shown only where getStockDocument() offers it
// (`canDecide`); the server asks again under the lock. A line the stock no longer covers is named
// with what is left, and the write-off keeps waiting (decided item 2). Not a create: a second
// press, or another Head's at the same moment, is refused as `wrong_status`. Refuse asks for a
// reason, which the Manager sees on the page (plan of 7.4c).

export function WriteOffDecision({
  documentId,
  number,
  lines,
}: {
  documentId: string;
  number: string;
  lines: readonly DocumentLine[];
}) {
  const t = useTranslations("warehouse.writeOff.page");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const [asking, setAsking] = useState<WriteOffOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  async function run(outcome: WriteOffOutcome) {
    setPending(true);
    try {
      const answer = await decideWriteOffAction({
        documentId,
        outcome,
        reason: outcome === "REFUSE" ? reason : undefined,
      });
      if (answer.ok) {
        toast.success(t(outcome === "APPROVE" ? "approved" : "refused", { number }));
        return;
      }
      const short = Object.keys(answer.error.fields ?? {}).flatMap((field) => {
        const line = lines.find((each) => field === `lines.${each.id}.qty`);
        if (!line) return [];
        return [
          t("short", {
            item: line.subtypeName ? `${line.productName} · ${line.subtypeName}` : line.productName,
            available: format.quantity(answer.error.available?.[field] ?? "0"),
            unit: line.unitShortName,
          }),
        ];
      });
      toast.error(short.length > 0 ? short.join(" ") : tAll(answer.error.messageKey));
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
      data-write-off-decision
      className="sticky bottom-0 z-10 flex flex-col-reverse gap-3 rounded-xl border border-t border-border bg-card p-4 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:p-6"
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
      <Button icon="check_circle" className="max-sm:h-12" onClick={() => setAsking("APPROVE")}>
        {t("approve")}
      </Button>
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
                result: t("approveResult", { count: lines.length }),
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
