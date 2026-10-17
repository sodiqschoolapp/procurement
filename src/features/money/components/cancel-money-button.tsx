"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { cancelMoneyAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { FIELD_CLASSES } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { MOVE_REASON_MAX, MOVE_REASON_MIN, isMoveReason } from "@/domain/order-moves";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

// Cancel a money action on the Money tab (08-money-and-settlement.md, Money ledger: "cancelled
// whole, with a reason, while none of its orders is Closed"; 11-screens-and-ux.md rule 6; plan of
// 4.3). Shown only where getOrderMoney() offers it (`cancel`); the server asks again. The dialog
// names every order of the action and its total, and says the result: the action is left out of
// every count and cannot be undone (review of the plan, Must fix 2). One reason of 5 to 500 (06
// rule 3), checked here only to enable Confirm; the confirm is the danger kind. A refusal names
// each refused order: a Closed one with "the Head reopens it first".

export function CancelMoneyButton({
  moneyActionId,
  orders,
  total,
}: {
  moneyActionId: string;
  orders: readonly { id: string; version: number; number: string }[];
  /** The action's total, whole so'm as decimal text. */
  total: string;
}) {
  const t = useTranslations("money.cancel");
  const tMoves = useTranslations("orders.moves");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const reasonId = useId();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const key = useRef<ClientKey | null>(null);
  const count = orders.length;
  const numbers = orders.map((order) => order.number).join(", ");

  async function run() {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      const answer = await cancelMoneyAction({
        clientKey: key.current,
        moneyActionId,
        orders: orders.map(({ id, version }) => ({ id, version })),
        reason,
      });
      answered = true;
      if (answer.ok) {
        toast.success(t("done", { count }));
        return;
      }
      const numberOf = new Map(orders.map((order) => [order.id, order.number]));
      const closed = new Set(
        (answer.error.orders ?? [])
          .filter((order) => order.fields?.status === "errors.field.closedReopenFirst")
          .map((order) => order.orderId),
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
        closed.has(orderId)
          ? tMoves("failedLine", {
              number: numberOf.get(orderId) ?? "",
              problem: tAll("errors.field.closedReopenFirst"),
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

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        pending={pending}
        onClick={() => {
          setReason("");
          setAsking(true);
        }}
        className="max-sm:w-full"
        data-cancel-money={moneyActionId}
      >
        {t("button")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={!isMoveReason(reason)}
        text={{
          title: t("title", { count, total: format.money(BigInt(total)) }),
          result: t("result", { count, numbers }),
          confirm: t("button"),
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
