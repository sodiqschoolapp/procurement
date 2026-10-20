"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { cancelPurchaseAction, cancelTripAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { FIELD_CLASSES } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { MOVE_REASON_MAX, MOVE_REASON_MIN, isMoveReason } from "@/domain/order-moves";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

// Cancel record and Cancel trip on the Purchases tab (07-purchasing.md, Fixing a mistake;
// 11-screens-and-ux.md rule 6: "ask for confirmation and state the result"; plan of 3.7). Shown
// only where the server's getOrderPage() offers it (`canCancel`, `trip`); the server asks again.
// One reason of 5 to 500 for the action (06 rule 3), checked here only to enable Confirm. The
// confirm button is the danger kind: a cancel cannot be undone (decided item 13). A refusal names
// each refused order, the short stock with its two ways out (07 Fixing a mistake 2). A call is
// never retried by the screen; its client key is kept only after a call with no answer.

export type CancelTarget =
  | { kind: "RECORD"; purchaseId: string; order: { id: string; version: number; number: string } }
  | {
      kind: "TRIP";
      tripId: string;
      orders: readonly { id: string; version: number; number: string }[];
    };

export function CancelPurchaseButton({ target }: { target: CancelTarget }) {
  const t = useTranslations("orders.page.purchases.cancel");
  const tMoves = useTranslations("orders.moves");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const reasonId = useId();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const key = useRef<ClientKey | null>(null);
  const orders = target.kind === "RECORD" ? [target.order] : target.orders;
  const count = orders.length;

  async function run() {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      const sent = {
        clientKey: key.current,
        orders: orders.map(({ id, version }) => ({ id, version })),
        reason,
      };
      const answer =
        target.kind === "RECORD"
          ? await cancelPurchaseAction({ ...sent, purchaseId: target.purchaseId })
          : await cancelTripAction({ ...sent, tripId: target.tripId });
      answered = true;
      if (answer.ok) {
        toast.success(t(`done.${target.kind}`, { count }));
        return;
      }
      const numberOf = new Map(orders.map((order) => [order.id, order.number]));
      const stockShort = new Set(
        (answer.error.orders ?? [])
          .filter((order) => order.fields?.stock === "errors.field.stockShort")
          .map((order) => order.orderId),
      );
      // The Manager to move the order back to before the cancel (plan of 4.10b, decided item 8).
      const moved = new Map(
        (answer.error.orders ?? [])
          .filter((order) => order.fields?.status === "errors.field.movedSince")
          .map((order) => [
            order.orderId,
            tAll("errors.field.movedSince", { manager: order.values?.manager ?? "" }),
          ]),
      );
      // The record's issue to reverse first (plan of 5.4b, decided item 3, Look first).
      const givenIssue = new Map(
        (answer.error.orders ?? [])
          .filter((order) => order.fields?.stock === "errors.field.givenIssuePosted")
          .map((order) => [
            order.orderId,
            tAll("errors.field.givenIssuePosted", { number: order.values?.number ?? "" }),
          ]),
      );
      const lines = moveFailureLines(
        answer.error,
        answer.decided,
        (id) => numberOf.get(id) ?? "",
        {
          alreadyDecided: (verb, values) => tMoves(`already.${verb}`, values),
          refused: (code) => tMoves(`refused.${code}`),
          failedLine: (values) => tMoves("failedLine", values),
        },
        format,
      ).map(({ orderId, line }) =>
        stockShort.has(orderId) || moved.has(orderId) || givenIssue.has(orderId)
          ? tMoves("failedLine", {
              number: numberOf.get(orderId) ?? "",
              problem:
                moved.get(orderId) ?? givenIssue.get(orderId) ?? tAll("errors.field.stockShort"),
            })
          : line,
      );
      toast.error(lines.length > 0 ? lines.join(" ") : tAll(answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      if (answered) key.current = null;
      setAsking(false);
      setPending(false);
      router.refresh();
    }
  }

  const label = t(`button.${target.kind}`, { count });
  return (
    <>
      <Button
        variant="secondary"
        pending={pending}
        onClick={() => {
          setReason("");
          setAsking(true);
        }}
        className="w-full sm:w-auto"
        data-cancel={target.kind}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={!isMoveReason(reason)}
        text={{
          title: t(`title.${target.kind}`, { count }),
          result: t(`result.${target.kind}`, { count }),
          confirm: label,
          danger: true,
        }}
        onConfirm={() => void run()}
      >
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-sm leading-5 font-semibold">
            {tMoves("reason")}
          </label>
          <textarea
            id={reasonId}
            data-reason
            value={reason}
            rows={3}
            maxLength={MOVE_REASON_MAX}
            disabled={pending}
            aria-describedby={`${reasonId}-hint`}
            onChange={(event) => setReason(event.target.value)}
            className={cn(FIELD_CLASSES, "min-h-20 py-2")}
          />
          <p id={`${reasonId}-hint`} className="text-[13px] leading-[18px] text-muted-foreground">
            {tMoves("reasonHint", {
              min: MOVE_REASON_MIN,
              max: MOVE_REASON_MAX,
              count: Array.from(reason.trim()).length,
            })}
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
