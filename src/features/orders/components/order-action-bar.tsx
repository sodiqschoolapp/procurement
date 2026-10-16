"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { submitDraftsAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

import { cellOfField } from "./grid-rules";

// The action bar of the order page (11-screens-and-ux.md, Order page layout 4: "fixed at the
// bottom: only the actions this user can take on this order now. If there are none, a line says
// who the order is waiting for"). Which moves are allowed is allowedActions() of the server; a
// button is shown only for a move with a server action, in 2.9 Submit (plan of 2.9, decided item 4,
// Look first). Submit asks first and states the result (11 rule 6); it is never retried
// automatically, and its client key is kept only after a call with no answer (decisions 2.7 item
// 13). A refusal names the fields to fix in the order list, where the drafts are edited.

export function OrderActionBar({
  orderId,
  version,
  canSubmit,
  waitingLine,
}: {
  orderId: string;
  version: number;
  canSubmit: boolean;
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
