"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { moveOrdersToManagerAction, moveOwnerChoicesAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { FIELD_CLASSES } from "@/components/ui/input";
import { cn } from "@/components/utils";
import type { MoveOrder } from "@/features/orders/components/move-button";
import { moveFailureLines } from "@/features/orders/move-lines";
import type { MoveOwnerChoice } from "@/features/orders/queries/move-owner-choices";
import { useFormatters } from "@/i18n/use-formatters";

// The Head's "Move to another Manager" of the ticked orders (03-roles-and-permissions.md rule 7;
// 11-screens-and-ux.md rule 6: "ask for confirmation and state the result"; plan of 4.10). Shown
// when the server's tickedSummary() says `canMoveOwner`. The dialog lists the active Managers of
// the orders' branch from the server and asks for one; the server asks everything again, and a
// refusal names every order (a cash count not 0, already this Manager's). A call is never retried
// by the screen; its client key is kept only after a call with no answer, as in MoveButton.

export function MoveOwnerButton({
  orders,
  versionOf,
  onAnswer,
  size,
  className,
}: {
  orders: readonly MoveOrder[];
  versionOf: (orderId: string) => number;
  onAnswer: (failed: { title: string; lines: { orderId: string; line: string }[] } | null) => void;
  size?: "sm";
  className?: string;
}) {
  const t = useTranslations("orders.moves");
  const tOwner = useTranslations("orders.moveOwner");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const selectId = useId();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [choices, setChoices] = useState<MoveOwnerChoice[] | null>(null);
  const [managerId, setManagerId] = useState("");
  const key = useRef<ClientKey | null>(null);
  const count = orders.length;

  async function open() {
    setManagerId("");
    setChoices(null);
    setAsking(true);
    try {
      const answer = await moveOwnerChoicesAction({ ids: orders.map((order) => order.id) });
      if (answer.ok) setChoices(answer.data);
      else {
        toast.error(tAll(answer.error.messageKey));
        setAsking(false);
      }
    } catch {
      toast.error(tAll("errors.network"));
      setAsking(false);
    }
  }

  async function run() {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      const answer = await moveOrdersToManagerAction({
        clientKey: key.current,
        orders: orders.map(({ id }) => ({ id, version: versionOf(id) })),
        managerId,
      });
      answered = true;
      if (answer.ok) {
        toast.success(t("done.MOVE_OWNER", { count: answer.data.orders.length }));
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
          refused: (code) =>
            code === "not_ready" ? t("notReady.MOVE_OWNER") : t(`refused.${code}`),
          failedLine: (values) => t("failedLine", values),
        },
        format,
      );
      if (lines.length === 0) {
        const field = answer.error.fields?.managerId;
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

  const label = t("button.MOVE_OWNER");
  return (
    <>
      <Button
        variant="secondary"
        pending={pending}
        onClick={() => void open()}
        size={size}
        className={className}
        data-move="MOVE_OWNER"
      >
        {count > 1 ? t("buttonCount", { label, count }) : label}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={managerId === ""}
        text={{
          title: t("title.MOVE_OWNER", { count }),
          result: t("result.MOVE_OWNER", { count }),
          confirm: label,
        }}
        onConfirm={() => void run()}
      >
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={selectId} className="text-sm leading-5 font-semibold">
            {tOwner("manager")}
          </label>
          {choices !== null && choices.length === 0 ? (
            <p data-no-managers className="text-[15px] leading-[22px] text-muted-foreground">
              {tOwner("noManagers")}
            </p>
          ) : (
            <select
              id={selectId}
              data-move-owner-select
              value={managerId}
              disabled={pending || choices === null}
              aria-busy={choices === null}
              onChange={(event) => setManagerId(event.target.value)}
              className={cn(FIELD_CLASSES, "h-11")}
            >
              <option value="">{tOwner(choices === null ? "loading" : "choose")}</option>
              {(choices ?? []).map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
