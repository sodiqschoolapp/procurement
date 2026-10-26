"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { copyOrdersAsNewAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

// Copy as new of ticked orders or of one order (05-order-request-form.md, Ticking and filters:
// "Any order, including a rejected one, can be copied into a new draft; several ticked orders can
// be copied at once"; 11-screens-and-ux.md rule 6: "ask for confirmation and state the result";
// plan of 2.13). Shown only when the server's `canCopy` says the user may add drafts in the branch
// of every ticked order; the server asks again. Each order carries its own client key, kept only
// after a call with no answer, so a retry gives the first answer (developer-rules.md rule 8;
// decisions 2.7 item 13). A merge into the user's draft is told as "Added to your draft: now 20"
// (05 Drafts 2). After a success the drafts grid of /orders is shown.

export type CopyOrder = { id: string; number: string };

export function CopyButton({
  orders,
  versionOf,
  onAnswer,
  size,
  variant = "secondary",
  className,
}: {
  /** The ticked orders. */
  orders: readonly CopyOrder[];
  /** The version the screen last showed an order at, read when the call goes out. */
  versionOf: (orderId: string) => number;
  /** Called after every answer: null on success, else one line per refused order. */
  onAnswer: (failed: { title: string; lines: { orderId: string; line: string }[] } | null) => void;
  size?: "sm";
  /** The order page's main action is the primary button (plan of 2.9b). */
  variant?: "default" | "secondary";
  className?: string;
}) {
  const t = useTranslations("orders.copy");
  const tAdd = useTranslations("orders.add");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const keys = useRef<Map<string, ClientKey> | null>(null);
  const count = orders.length;

  async function run() {
    setPending(true);
    keys.current ??= new Map(orders.map((order) => [order.id, newClientKey()]));
    const sentKeys = keys.current;
    let answered = false;
    let copied = false;
    try {
      const answer = await copyOrdersAsNewAction({
        orders: orders.map(({ id }) => ({
          id,
          version: versionOf(id),
          clientKey: sentKeys.get(id) ?? newClientKey(),
        })),
      });
      answered = true;
      if (answer.ok) {
        copied = true;
        toast.success(t("done", { count: answer.data.orders.length }));
        for (const order of answer.data.orders) {
          if (order.merged && order.quantity) {
            toast.success(tAdd("merged", { quantity: format.quantity(order.quantity) }));
          }
        }
        onAnswer(null);
        return;
      }
      const numberOf = new Map(orders.map((order) => [order.id, order.number]));
      const lines = moveFailureLines(
        answer.error,
        [],
        (id) => numberOf.get(id) ?? "",
        {
          alreadyDecided: () => "",
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
      if (answered) keys.current = null;
      setAsking(false);
      setPending(false);
      if (copied) router.push("/orders#drafts-title");
      router.refresh();
    }
  }

  return (
    <>
      <Button
        variant={variant}
        pending={pending}
        onClick={() => setAsking(true)}
        size={size}
        className={className}
        data-copy-as-new
      >
        {count > 1 ? t("buttonCount", { count }) : t("button")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        text={{ title: t("title", { count }), result: t("result"), confirm: t("button") }}
        onConfirm={() => void run()}
      />
    </>
  );
}
