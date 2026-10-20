"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { approveOrdersAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { parseSomOrZero } from "@/domain/money";
import { actionTotal, approvalCashRows, plannedCashOf } from "@/domain/money-ledger";
import { totalsByPaymentType } from "@/domain/order-totals";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

// Approve of ticked orders or of one order (06-approval-workflow.md, Allowed moves: the three
// Approve rows; rules 1, 7, 8; 11-screens-and-ux.md rule 6: "ask for confirmation and state the
// result"; plan of 2.10). The button is shown only when the server's allowedActions() names
// APPROVE for every ticked order; the server asks the state machine again. At Finance's step the
// dialog holds a payment type per order, the one field an approver may change (06 rule 1); the
// total does not change. Under the selects (08 When Finance approves; plan of 4.2): the planned
// totals per payment type, following the selects (totalsByPaymentType()), and the table "Cash
// given to the Manager now", one block per Manager, one row per order whose planned cash under
// its select is above 0 (plannedCashOf()), prefilled and changeable; a row set to 0 stays and
// can be typed again (review of the plan, correction 1). The result line states the cash given
// (11 rule 6), from approvalCashRows() and actionTotal(), which drop the rows of 0. A call is never
// retried by the screen; its client key is kept only after a call with no answer (decisions 2.7
// item 13). After every answer the page is refreshed and the caller clears its ticks (decided
// item 6); a refusal names every order with its reason, "Already approved by … at …" where the
// server named who approved it meanwhile.

export type ApproveOrder = {
  id: string;
  number: string;
  status: string;
  paymentType: PaymentType;
  /** The planned total, whole so'm as decimal text (CLAUDE.md rule 6). */
  plannedTotal: string;
  owner: { id: string; name: string };
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
  // What Finance typed per order; an order not here shows its prefilled planned cash.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const key = useRef<ClientKey | null>(null);
  const finance = orders.length > 0 && orders.every((order) => order.status === "PENDING_FINANCE");

  const typeOf = (order: ApproveOrder) => types[order.id] ?? order.paymentType;
  const prefilled = (order: ApproveOrder) =>
    plannedCashOf(typeOf(order), BigInt(order.plannedTotal));
  // The table's rows: the orders with planned cash under their select (08 When Finance approves).
  const cashOrders = finance ? orders.filter((order) => prefilled(order) > 0n) : [];
  const textOf = (order: ApproveOrder) => typed[order.id] ?? prefilled(order).toString();
  const amounts = cashOrders.map((order) => ({
    id: order.id,
    ownerId: order.owner.id,
    amount: parseSomOrZero(textOf(order)),
  }));
  const cashValid = amounts.every((row) => row.amount !== null);
  const given = cashValid
    ? approvalCashRows(amounts.map((row) => ({ ...row, amount: row.amount! })))
    : [];
  const givenTotal = actionTotal(given.flatMap((block) => block.rows));
  const byType = totalsByPaymentType(
    orders.map((order) => ({ paymentType: typeOf(order), total: BigInt(order.plannedTotal) })),
  );
  // One block per Manager, in the order of the orders.
  const blocks = new Map<string, { name: string; orders: ApproveOrder[] }>();
  for (const order of cashOrders) {
    const block = blocks.get(order.owner.id) ?? { name: order.owner.name, orders: [] };
    block.orders.push(order);
    blocks.set(order.owner.id, block);
  }

  function open() {
    setTypes(Object.fromEntries(orders.map((order) => [order.id, order.paymentType])));
    setTyped({});
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
      // Every row the table shows goes out, a row of 0 too; the server writes none of 0.
      const cash = Object.fromEntries(amounts.map((row) => [row.id, row.amount!.toString()]));
      const answer = await approveOrdersAction({
        clientKey: key.current,
        orders: orders.map(({ id }) => ({ id, version: versionOf(id) })),
        ...(Object.keys(changed).length > 0 ? { paymentTypes: changed } : {}),
        ...(amounts.length > 0 ? { cash } : {}),
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
        const field = answer.error.fields?.cash;
        toast.error(tAll(field ?? answer.error.messageKey));
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
        confirmDisabled={!cashValid}
        text={{
          title: t("title", { count: orders.length }),
          result:
            t(finance ? "resultFinance" : "result", { count: orders.length, total }) +
            (givenTotal > 0n
              ? ` ${t("resultCash", { amount: format.money(givenTotal), managers: given.length })}`
              : ""),
          confirm: t("button"),
        }}
        onConfirm={() => void approve()}
      >
        {finance ? (
          <div className="mt-4 flex max-h-[50vh] flex-col gap-5 overflow-y-auto">
            <ul data-payment-types className="flex flex-col gap-3">
              {orders.map((order) => (
                <li key={order.id} className="flex flex-col gap-1">
                  <label htmlFor={`pay-${order.id}`} className="text-small text-muted-foreground">
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
            <section aria-labelledby="approve-type-totals" data-type-totals>
              <h3 id="approve-type-totals" className="text-sm font-semibold">
                {t("totalsTitle")}
              </h3>
              <dl className="mt-2 flex flex-col gap-1 text-sm">
                {PAYMENT_TYPES.filter((type) => byType[type] > 0n).map((type) => (
                  <div key={type} data-type-total={type} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{tPayment(type)}</dt>
                    <dd className="tabular-nums">{format.money(byType[type])}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {cashOrders.length > 0 ? (
              <section aria-labelledby="approve-cash" data-cash-table>
                <h3 id="approve-cash" className="text-sm font-semibold">
                  {t("cashTitle")}
                </h3>
                <p className="text-small text-muted-foreground">{t("cashHint")}</p>
                {[...blocks].map(([ownerId, block]) => (
                  <div key={ownerId} data-cash-block={ownerId} className="mt-3 flex flex-col gap-3">
                    <h4 className="text-small font-semibold">{block.name}</h4>
                    {block.orders.map((order) => {
                      const invalid = parseSomOrZero(textOf(order)) === null;
                      return (
                        <div
                          key={order.id}
                          data-cash-row={order.id}
                          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                        >
                          <label htmlFor={`cash-${order.id}`} className="flex flex-col">
                            <span className="text-sm">{order.number}</span>
                            <span className="text-small text-muted-foreground">
                              {t("plannedCash", { amount: format.money(prefilled(order)) })}
                            </span>
                          </label>
                          <div className="flex flex-col gap-1 sm:w-40">
                            <Input
                              id={`cash-${order.id}`}
                              inputMode="numeric"
                              autoComplete="off"
                              value={textOf(order)}
                              disabled={pending}
                              aria-invalid={invalid || undefined}
                              aria-describedby={invalid ? `cash-error-${order.id}` : undefined}
                              className="text-right tabular-nums"
                              onChange={(event) =>
                                setTyped((current) => ({
                                  ...current,
                                  [order.id]: event.target.value,
                                }))
                              }
                            />
                            {invalid ? (
                              <p
                                id={`cash-error-${order.id}`}
                                className="text-small text-destructive"
                              >
                                {t("cashInvalid")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
