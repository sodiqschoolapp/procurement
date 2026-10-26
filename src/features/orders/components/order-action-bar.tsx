"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { submitDraftsAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { type PageAction, mainAction } from "@/domain/main-action";
import type { RequestStatus } from "@/domain/request-status";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";

import { RecordMoneyButton } from "@/features/money/components/record-money-button";

import { type ApproveOrder, ApproveButton } from "./approve-button";
import { CopyButton } from "./copy-button";
import { type MoveKind, MoveButton } from "./move-button";
import { cellOfField } from "./grid-rules";

// The action bar of the order page (11-screens-and-ux.md, Order page layout 4: "the main next
// action this user can take as one button, and the user's other actions now under More. If there
// are none, the top line already says who the order is waiting for"; plan of 2.9b). It stands
// under the order's header and stays in view under the top bar from 640 px (redesign of
// 21.10.2026). What is offered is the server's: allowedActions(), buyingActions() and the page's
// can… facts; mainAction() of src/domain/main-action.ts picks the one primary button (decided item
// 1, Look first), and the rest open under "More", a disclosure inside the bar rather than a
// pop-up menu, because each action's confirmation dialog lives in its button (decided item 8).
// Submit asks first and states the result (11 rule 6); it is never retried automatically, and its
// client key is kept only after a call with no answer (decisions 2.7 item 13). A refusal names the
// fields to fix in the order list, where the drafts are edited.

export function OrderActionBar({
  orderId,
  status,
  version,
  canSubmit,
  approve,
  moves,
  number,
  canCopy,
  recordPurchase,
  canRecordMoney = false,
  settle = null,
  skippedFinance = false,
}: {
  orderId: string;
  status: RequestStatus;
  version: number;
  canSubmit: boolean;
  /** The moves of MoveButton the server allows on this order, in the table's order. */
  moves: readonly MoveKind[];
  /** The order's number; null for a draft never submitted, which none of `moves` applies to. */
  number: string | null;
  /**
   * The order as Approve sends it, with its planned total formatted and the Finance step the
   * server read (plan of 4.10c); null without the move.
   */
  approve: { order: ApproveOrder; total: string; financeStep: boolean } | null;
  /** Copy as new is offered (05 Ticking and filters; plan of 2.13): the server's `canCopy`. */
  canCopy: boolean;
  /** The purchase form's address when the server's `canRecordPurchase` is set (plan of 3.3). */
  recordPurchase: string | null;
  /** Record money is offered (08 Money ledger; plan of 4.3): the server's `canRecordMoney`. */
  canRecordMoney?: boolean;
  /** The settlement screen's address when the server's `canSettle` is set (plan of 4.5). */
  settle?: string | null;
  /** The order skipped Finance: the Reopen dialog says so (06 Finance step switched off 6). */
  skippedFinance?: boolean;
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
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

  const offered: PageAction[] = [
    ...(recordPurchase ? (["RECORD_PURCHASE"] as const) : []),
    ...(settle ? (["SETTLE"] as const) : []),
    ...(canRecordMoney ? (["RECORD_MONEY"] as const) : []),
    ...(approve ? (["APPROVE"] as const) : []),
    ...(canSubmit ? (["SUBMIT"] as const) : []),
    // A move needs the order's number; a draft never submitted has none of them.
    ...(number ? moves : []),
    ...(number && canCopy ? (["COPY"] as const) : []),
  ];
  const main = mainAction(status, offered);
  const others = offered.filter((action) => action !== main);
  const answered = (answer: { lines: { line: string }[] } | null) => {
    setRefused(answer?.lines[0]?.line ?? null);
    setMoreOpen(false);
  };

  function button(action: PageAction, primary: boolean) {
    const variant = primary ? "default" : "secondary";
    const className = "max-sm:h-11 max-sm:w-full";
    switch (action) {
      case "RECORD_PURCHASE":
        return (
          <Link
            key={action}
            href={recordPurchase!}
            data-record-purchase
            className={cn(buttonVariants({ variant }), className)}
          >
            {t("recordPurchase")}
          </Link>
        );
      case "SETTLE":
        return (
          <Link
            key={action}
            href={settle!}
            data-settle
            className={cn(buttonVariants({ variant }), className)}
          >
            {t("settle")}
          </Link>
        );
      case "RECORD_MONEY":
        return (
          <RecordMoneyButton
            key={action}
            orderIds={[orderId]}
            variant={variant}
            onAnswer={answered}
            className={className}
          />
        );
      case "APPROVE":
        return (
          <ApproveButton
            key={action}
            orders={[approve!.order]}
            versionOf={() => version}
            total={approve!.total}
            financeStep={approve!.financeStep}
            onAnswer={answered}
            className={className}
          />
        );
      case "SUBMIT":
        return (
          <Button
            key={action}
            variant={variant}
            pending={pending}
            onClick={() => setAsking(true)}
            className={className}
          >
            {t("submit")}
          </Button>
        );
      case "COPY":
        return (
          <CopyButton
            key={action}
            orders={[{ id: orderId, number: number! }]}
            versionOf={() => version}
            variant={variant}
            onAnswer={answered}
            className={className}
          />
        );
      default:
        return (
          <MoveButton
            key={action}
            move={action}
            variant={variant}
            orders={[{ id: orderId, number: number! }]}
            skipped={skippedFinance ? "all" : "none"}
            versionOf={() => version}
            onAnswer={answered}
            className={className}
          />
        );
    }
  }

  // Nothing to offer: no bar; the top line says who the order waits for (11 layout 4).
  if (offered.length === 0 && !failure && !refused) return null;

  return (
    <section
      aria-labelledby="order-bar-title"
      aria-live="polite"
      data-order-bar
      className="z-10 flex flex-col gap-3 rounded-xl border border-border-strong bg-card p-3 sm:sticky sm:top-[4.5rem] sm:p-4 sm:shadow-float"
    >
      <h2 id="order-bar-title" className="sr-only">
        {t("title")}
      </h2>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}{" "}
          <Link href="/orders" className="font-semibold underline underline-offset-2">
            {t("editInList")}
          </Link>
        </p>
      ) : null}
      {refused ? (
        <p role="alert" data-approve-failed className="text-sm text-destructive">
          {refused}
        </p>
      ) : null}
      {offered.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {main ? (
            <div data-main-action={main} className="contents">
              {button(main, true)}
            </div>
          ) : null}
          {others.length > 0 ? (
            <Button
              variant="secondary"
              icon="more_horiz"
              aria-expanded={moreOpen}
              aria-controls={moreId}
              onClick={() => setMoreOpen((open) => !open)}
              className="max-sm:h-11 max-sm:w-full"
              data-bar-more
            >
              {t("more")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {others.length > 0 ? (
        <div
          id={moreId}
          hidden={!moreOpen}
          data-more-actions
          className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap sm:gap-3"
        >
          {others.map((action) => button(action, false))}
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
