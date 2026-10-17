"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { submitDraftsAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";

import { RecordMoneyButton } from "@/features/money/components/record-money-button";

import { type ApproveOrder, ApproveButton } from "./approve-button";
import { CopyButton } from "./copy-button";
import { type MoveKind, MoveButton } from "./move-button";
import { cellOfField } from "./grid-rules";

// The action bar of the order page (11-screens-and-ux.md, Order page layout 4: "fixed at the
// bottom: only the actions this user can take on this order now. If there are none, a line says
// who the order is waiting for"). Which moves are allowed is allowedActions() of the server; a
// button is shown only for a move with a server action: Submit (plan of 2.9, decided item 4,
// Look first; a taken-back Draft too since 2.11), Approve (2.10), Send back, Reject, Cancel, Take
// back and Submit again (2.11); Copy as new (2.13), beside them and on a Rejected, Cancelled or
// Closed order whose bar has no move. Submit asks first and states the result (11 rule 6); it is never retried
// automatically, and its client key is kept only after a call with no answer (decisions 2.7 item
// 13). A refusal names the fields to fix in the order list, where the drafts are edited.

export function OrderActionBar({
  orderId,
  version,
  canSubmit,
  approve,
  moves,
  number,
  canCopy,
  recordPurchase,
  canRecordMoney = false,
  waitingLine,
}: {
  orderId: string;
  version: number;
  canSubmit: boolean;
  /** The moves of MoveButton the server allows on this order, in the table's order. */
  moves: readonly MoveKind[];
  /** The order's number; null for a draft never submitted, which none of `moves` applies to. */
  number: string | null;
  /** The order as Approve sends it, with its planned total formatted; null without the move. */
  approve: { order: ApproveOrder; total: string } | null;
  /** Copy as new is offered (05 Ticking and filters; plan of 2.13): the server's `canCopy`. */
  canCopy: boolean;
  /** The purchase form's address when the server's `canRecordPurchase` is set (plan of 3.3). */
  recordPurchase: string | null;
  /** Record money is offered (08 Money ledger; plan of 4.3): the server's `canRecordMoney`. */
  canRecordMoney?: boolean;
  /** Shown when the user has no allowed move; null otherwise. */
  waitingLine: string | null;
}) {
  const t = useTranslations("orders.page.bar");
  const tColumns = useTranslations("orders.columns");
  const tRefused = useTranslations("orders.submit.refused");
  const tAll = useTranslations();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const key = useRef<ClientKey | null>(null);

  async function submit() {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      const result = await submitDraftsAction({
        clientKey: key.current,
        orders: [{ id: orderId, version }],
      });
      answered = true;
      setAsking(false);
      if (result.ok) {
        setFailure(null);
        toast.success(t("done", { number: result.data.orders[0]?.number ?? "" }));
        return;
      }
      const refused = result.error.orders?.[0];
      if (!refused) {
        setFailure(tAll(result.error.messageKey));
        return;
      }
      const fields = Object.keys(refused.fields ?? {});
      setFailure(
        fields.length > 0
          ? t("failed", {
              fields: [...new Set(fields.map((field) => tColumns(cellOfField(field))))].join(", "),
            })
          : tRefused(refused.code),
      );
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      if (answered) key.current = null;
      setPending(false);
      router.refresh();
    }
  }

  return (
    <section
      aria-labelledby="order-bar-title"
      aria-live="polite"
      data-order-bar
      className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border-t border-border bg-card p-4 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <h2 id="order-bar-title" className="sr-only">
        {t("title")}
      </h2>
      {waitingLine ? (
        <p data-waiting className="text-[15px] leading-[22px] text-muted-foreground">
          {waitingLine}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-[15px] leading-[22px] text-destructive">
          {failure}{" "}
          <Link href="/orders" className="font-semibold underline underline-offset-2">
            {t("editInList")}
          </Link>
        </p>
      ) : null}
      {refused ? (
        <p role="alert" data-approve-failed className="text-[15px] leading-[22px] text-destructive">
          {refused}
        </p>
      ) : null}
      {approve || recordPurchase || canRecordMoney || ((moves.length > 0 || canCopy) && number) ? (
        <div className="flex flex-wrap gap-3 sm:ml-auto">
          {recordPurchase ? (
            <Link
              href={recordPurchase}
              data-record-purchase
              className={cn(buttonVariants({ variant: "default" }), "max-sm:h-11 max-sm:w-full")}
            >
              {t("recordPurchase")}
            </Link>
          ) : null}
          {canRecordMoney ? (
            <RecordMoneyButton
              orderIds={[orderId]}
              onAnswer={(answer) => setRefused(answer?.lines[0]?.line ?? null)}
              className="max-sm:h-11 max-sm:w-full"
            />
          ) : null}
          {approve ? (
            <ApproveButton
              orders={[approve.order]}
              versionOf={() => version}
              total={approve.total}
              onAnswer={(answer) => setRefused(answer?.lines[0]?.line ?? null)}
              className="max-sm:h-11 max-sm:w-full"
            />
          ) : null}
          {number
            ? moves.map((move) => (
                <MoveButton
                  key={move}
                  move={move}
                  variant={move === "SUBMIT_AGAIN" ? "default" : "secondary"}
                  orders={[{ id: orderId, number }]}
                  versionOf={() => version}
                  onAnswer={(answer) => setRefused(answer?.lines[0]?.line ?? null)}
                  className="max-sm:h-11 max-sm:w-full"
                />
              ))
            : null}
          {number && canCopy ? (
            <CopyButton
              orders={[{ id: orderId, number }]}
              versionOf={() => version}
              onAnswer={(answer) => setRefused(answer?.lines[0]?.line ?? null)}
              className="max-sm:h-11 max-sm:w-full"
            />
          ) : null}
        </div>
      ) : null}
      {canSubmit ? (
        <div className="flex flex-wrap gap-3 sm:ml-auto">
          <Button
            pending={pending}
            onClick={() => setAsking(true)}
            className="max-sm:h-11 max-sm:w-full"
          >
            {t("submit")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        text={{ title: t("submitTitle"), result: t("submitResult"), confirm: t("submit") }}
        onConfirm={() => void submit()}
      />
    </section>
  );
}
