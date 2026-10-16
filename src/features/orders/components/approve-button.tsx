"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { approveOrdersAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

// Approve of ticked orders or of one order (06-approval-workflow.md, Allowed moves: the three
// Approve rows; rules 1, 7, 8; 11-screens-and-ux.md rule 6: "ask for confirmation and state the
// result"; plan of 2.10). The button is shown only when the server's allowedActions() names
// APPROVE for every ticked order; the server asks the state machine again. At Finance's step the
// dialog holds a payment type per order, the one field an approver may change (06 rule 1); the
// total does not change, and the per-type cash table of the dialog is 4.2. A call is never
// retried by the screen; its client key is kept only after a call with no answer (decisions 2.7
// item 13). After every answer the page is refreshed and the caller clears its ticks (decided
// item 6); a refusal names every order with its reason, "Already approved by … at …" where the
// server named who approved it meanwhile.

export type ApproveOrder = {
  id: string;
  number: string;
  status: string;
  paymentType: PaymentType;
};

export function ApproveButton({
  orders,
  versionOf,
  total,
  onAnswer,
  size,
  className,
}: {
  /** Small in a desktop selection bar beside Clear (design system: one size in one row). */
  size?: "sm";
  /** The ticked orders. */
  orders: readonly ApproveOrder[];
  /** The version the screen last showed an order at, read when the call goes out (06 rule 7). */
  versionOf: (orderId: string) => number;
  /** The grand total of the ticked orders, as the server computed it, formatted. */
  total: string;
  /** Called after every answer: null on success, else one line per refused order. */
  onAnswer: (failed: { title: string; lines: { orderId: string; line: string }[] } | null) => void;
  className?: string;
}) {
  const t = useTranslations("orders.approve");
  const tMoves = useTranslations("orders.moves");
  const tPayment = useTranslations("paymentTypes");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [types, setTypes] = useState<Record<string, PaymentType>>({});
  const key = useRef<ClientKey | null>(null);
  const finance = orders.length > 0 && orders.every((order) => order.status === "PENDING_FINANCE");

  function open() {
    setTypes(Object.fromEntries(orders.map((order) => [order.id, order.paymentType])));
    setAsking(true);
  }

  async function approve() {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      // Only the changed types go out; the server writes nothing for an unchanged one.
      const changed = finance
        ? Object.fromEntries(
            orders.flatMap((order) =>
              types[order.id] && types[order.id] !== order.paymentType
                ? [[order.id, types[order.id]!]]
                : [],
            ),
          )
        : {};
      const answer = await approveOrdersAction({
        clientKey: key.current,
        orders: orders.map(({ id }) => ({ id, version: versionOf(id) })),
        ...(Object.keys(changed).length > 0 ? { paymentTypes: changed } : {}),
      });
      answered = true;
      if (answer.ok) {
        toast.success(t("done", { count: answer.data.orders.length }));
        onAnswer(null);
        return;
      }
      const numberOf = new Map(orders.map((order) => [order.id, order.number]));
      const lines = moveFailureLines(
        answer.error,
        answer.decided,
        (id) => numberOf.get(id) ?? "",
        {
          alreadyDecided: (verb, values) => tMoves(`already.${verb}`, values),
          refused: (code) => t(`refused.${code}`),
          failedLine: (values) => t("failedLine", values),
        },
        format,
      );
      if (lines.length === 0) {
        toast.error(tAll(answer.error.messageKey));
        onAnswer(null);
        return;
      }
      onAnswer({ title: t("failedTitle", { count: lines.length }), lines });
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
      <Button pending={pending} onClick={open} size={size} className={className}>
        {orders.length > 1 ? t("buttonCount", { count: orders.length }) : t("button")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        text={{
          title: t("title", { count: orders.length }),
          result: t(finance ? "resultFinance" : "result", { count: orders.length, total }),
          confirm: t("button"),
        }}
        onConfirm={() => void approve()}
      >
        {finance ? (
          <ul data-payment-types className="mt-4 flex max-h-[40vh] flex-col gap-3 overflow-y-auto">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-1">
                <label
                  htmlFor={`pay-${order.id}`}
                  className="text-[13px] leading-[18px] text-muted-foreground"
                >
                  {t("paymentOf", { number: order.number })}
                </label>
                <Select
                  id={`pay-${order.id}`}
                  value={types[order.id] ?? order.paymentType}
                  disabled={pending}
                  onChange={(event) =>
                    setTypes((current) => ({
                      ...current,
                      [order.id]: event.target.value as PaymentType,
                    }))
                  }
                >
                  {PAYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tPayment(type)}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
