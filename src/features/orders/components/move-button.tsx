"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import {
  type MoveAnswer,
  cancelOrdersAction,
  closeExactOrdersAction,
  closeOrdersAction,
  finishOrdersAction,
  markNotBoughtAction,
  rejectOrdersAction,
  reopenBuyingAction,
  sendBackOrdersAction,
  sendBackForCorrectionOrdersAction,
  sendToSettlementOrdersAction,
  submitAgainOrdersAction,
  takeBackOrdersAction,
} from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { FIELD_CLASSES } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { MOVE_REASON_MAX, MOVE_REASON_MIN, isMoveReason } from "@/domain/order-moves";
import type { BuyingAction } from "@/domain/purchases";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

// Send back, Reject, Cancel, Take back and Submit again of ticked orders or of one order
// (06-approval-workflow.md, Allowed moves; rules 3, 7, 8; 11-screens-and-ux.md rule 6: "ask for
// confirmation and state the result"; plan of 2.11). The button is shown only when the server's
// allowedActions() names the move for every ticked order; the server asks the state machine
// again. Send back, Reject and Cancel take one reason for the whole action (06 rule 3): Confirm
// waits for 5 characters and the server checks again (decided item 11); Send back also takes an
// optional note per order. A call is never retried by the screen; its client key is kept only
// after a call with no answer (decisions 2.7 item 13). After every answer the page is refreshed
// and the caller clears its ticks; a refusal names every order, "Already … by … at …" where the
// server named who moved it meanwhile (decided item 7). Since 3.5 also the buying actions Finish
// order and Not bought (one reason) and Reopen buying, which move no status (07 Order progress;
// plan of 3.5, decided item 13): shown when the server's buyingActions() names them. Since 4.4
// Close of exact matches, whose dialog carries 08 Closing 1's sentence, and Send to settlement.
// Since 4.5 Finance's Send back for correction, with one reason (06 Allowed moves; 08 Closing 4).
// Since 4.6 Finance's Close, whose "not ready" line says what readiness needs (08 Closing 3).

/** The state machine's moves this button makes. */
export type StatusMoveKind =
  | "SEND_BACK"
  | "REJECT"
  | "CANCEL"
  | "TAKE_BACK"
  | "SUBMIT_AGAIN"
  | "CLOSE_EXACT"
  | "SEND_TO_SETTLEMENT"
  | "SEND_BACK_FOR_CORRECTION"
  | "CLOSE";
export type MoveKind = StatusMoveKind | BuyingAction;

const RUN: Record<MoveKind, (input: unknown) => Promise<MoveAnswer>> = {
  SEND_BACK: sendBackOrdersAction,
  REJECT: rejectOrdersAction,
  CANCEL: cancelOrdersAction,
  TAKE_BACK: takeBackOrdersAction,
  SUBMIT_AGAIN: submitAgainOrdersAction,
  CLOSE_EXACT: closeExactOrdersAction,
  SEND_TO_SETTLEMENT: sendToSettlementOrdersAction,
  SEND_BACK_FOR_CORRECTION: sendBackForCorrectionOrdersAction,
  CLOSE: closeOrdersAction,
  FINISH_ORDER: finishOrdersAction,
  MARK_NOT_BOUGHT: markNotBoughtAction,
  REOPEN_BUYING: reopenBuyingAction,
};

/** The moves that need a reason (06 rule 3; 07 Order progress: Finish order and Not bought). */
const WITH_REASON: ReadonlySet<MoveKind> = new Set([
  "SEND_BACK",
  "REJECT",
  "CANCEL",
  "SEND_BACK_FOR_CORRECTION",
  "FINISH_ORDER",
  "MARK_NOT_BOUGHT",
]);

/** The moves that end an order for good: the danger button (design system, dialogs). */
const FINAL: ReadonlySet<MoveKind> = new Set(["REJECT", "CANCEL"]);

export type MoveOrder = { id: string; number: string };

export function MoveButton({
  move,
  orders,
  versionOf,
  onAnswer,
  size,
  variant = "secondary",
  className,
}: {
  move: MoveKind;
  /** The ticked orders. */
  orders: readonly MoveOrder[];
  /** The version the screen last showed an order at, read when the call goes out (06 rule 7). */
  versionOf: (orderId: string) => number;
  /** Called after every answer: null on success, else one line per refused order. */
  onAnswer: (failed: { title: string; lines: { orderId: string; line: string }[] } | null) => void;
  /** Small in a desktop selection bar beside Clear (design system: one size in one row). */
  size?: "sm";
  variant?: "default" | "secondary";
  className?: string;
}) {
  const t = useTranslations("orders.moves");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const reasonId = useId();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const key = useRef<ClientKey | null>(null);
  const needsReason = WITH_REASON.has(move);
  const count = orders.length;

  function open() {
    setReason("");
    setNotes({});
    setAsking(true);
  }

  async function run() {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      const written = Object.fromEntries(
        Object.entries(notes).filter(([, text]) => text.trim() !== ""),
      );
      const answer = await RUN[move]({
        clientKey: key.current,
        orders: orders.map(({ id }) => ({ id, version: versionOf(id) })),
        ...(needsReason ? { reason } : {}),
        ...(move === "SEND_BACK" && Object.keys(written).length > 0 ? { notes: written } : {}),
      });
      answered = true;
      if (answer.ok) {
        toast.success(t(`done.${move}`, { count: answer.data.orders.length }));
        onAnswer(null);
        return;
      }
      const numberOf = new Map(orders.map((order) => [order.id, order.number]));
      const lines = moveFailureLines(
        answer.error,
        answer.decided,
        (id) => numberOf.get(id) ?? "",
        {
          alreadyDecided: (verb, values) => t(`already.${verb}`, values),
          // A buying action's "not ready" is what the order has received (decided item 8); Close's
          // is what readiness needs (08 Closing 3).
          refused: (code) =>
            code === "not_ready" &&
            (move === "FINISH_ORDER" || move === "MARK_NOT_BOUGHT" || move === "CLOSE")
              ? t(`notReady.${move}`)
              : t(`refused.${code}`),
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

  const label = t(`button.${move}`);
  return (
    <>
      <Button
        variant={variant}
        pending={pending}
        onClick={open}
        size={size}
        className={className}
        data-move={move}
      >
        {count > 1 ? t("buttonCount", { label, count }) : label}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={needsReason && !isMoveReason(reason)}
        text={{
          title: t(`title.${move}`, { count }),
          result: t(`result.${move}`, { count }),
          confirm: label,
          danger: FINAL.has(move),
        }}
        onConfirm={() => void run()}
      >
        {move === "CLOSE_EXACT" ? (
          <p data-close-confirm className="mt-4 text-[15px] leading-[22px] font-semibold">
            {t("closeConfirm")}
          </p>
        ) : null}
        {needsReason ? (
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm leading-5 font-semibold">
              {t("reason")}
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
              {t("reasonHint", {
                min: MOVE_REASON_MIN,
                max: MOVE_REASON_MAX,
                count: Array.from(reason.trim()).length,
              })}
            </p>
          </div>
        ) : null}
        {move === "SEND_BACK" ? (
          <fieldset className="mt-4 flex flex-col gap-3">
            <legend className="text-sm leading-5 font-semibold">{t("notesTitle")}</legend>
            <ul data-notes className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto">
              {orders.map((order) => (
                <li key={order.id} className="flex flex-col gap-1">
                  <label
                    htmlFor={`note-${order.id}`}
                    className="text-[13px] leading-[18px] text-muted-foreground"
                  >
                    {t("noteOf", { number: order.number })}
                  </label>
                  <textarea
                    id={`note-${order.id}`}
                    rows={2}
                    maxLength={MOVE_REASON_MAX}
                    disabled={pending}
                    value={notes[order.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [order.id]: event.target.value }))
                    }
                    className={cn(FIELD_CLASSES, "min-h-16 py-2")}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
