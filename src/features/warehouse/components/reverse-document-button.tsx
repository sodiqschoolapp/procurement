"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
  reversePreviewAction,
  reverseStockDocumentAction,
} from "@/app/(app)/warehouse/items/[id]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { FIELD_CLASSES } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { MOVE_REASON_MAX, MOVE_REASON_MIN, isMoveReason } from "@/domain/order-moves";
import type { ReversePreview } from "@/features/warehouse/queries/reverse-preview";
import { useFormatters } from "@/i18n/use-formatters";

// Reverse on a row of the item card (09-warehouse.md, Movement types, last paragraph: "A wrong
// document is fixed with 'Reverse', which writes the opposite movement and needs a reason"; Issue
// to a department 3; 11-screens-and-ux.md rule 6: "ask for confirmation and state the result";
// plan of 5.7, decided item 6). Shown only where getItemCard() offers it (`canReverse`); the
// server asks again. The dialog reads the document's lines first, since one press reverses them
// all; an issue's line over what the department holds is warned about, the reason serving as the
// comment (review of the plan, correction 1). The confirm button is the danger kind: a reverse
// cannot be undone. Not a create, so no client key: a second press is refused as `wrong_status`.

export function ReverseDocumentButton({
  documentId,
  number,
}: {
  documentId: string;
  number: string;
}) {
  const t = useTranslations("warehouse.reverse");
  const tMoves = useTranslations("orders.moves");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const reasonId = useId();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ReversePreview | null>(null);

  const itemName = (line: ReversePreview["lines"][number]) =>
    line.subtypeName ? `${line.productName}, ${line.subtypeName}` : line.productName;

  async function open() {
    setReason("");
    setPreview(null);
    setAsking(true);
    try {
      const answer = await reversePreviewAction({ documentId });
      if (answer.ok) {
        setPreview(answer.data);
        return;
      }
      toast.error(tAll(answer.error.messageKey));
      setAsking(false);
    } catch {
      toast.error(tAll("errors.network"));
      setAsking(false);
    }
  }

  async function run() {
    setPending(true);
    try {
      const answer = await reverseStockDocumentAction({ documentId, reason });
      if (answer.ok) {
        toast.success(t("done", { number }));
        return;
      }
      const lines = Object.entries(answer.error.fields ?? {}).flatMap(([field, key]) => {
        const line = preview?.lines.find((each) => field === `lines.${each.id}.qty`);
        if (!line || key !== "errors.field.reverseStockShort") return [];
        const left = answer.error.available?.[field] ?? "0";
        return [
          t("short", {
            item: itemName(line),
            left: `${format.quantity(left)} ${line.unitShortName}`,
          }),
        ];
      });
      toast.error(lines.length > 0 ? lines.join(" ") : tAll(answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      setAsking(false);
      setPending(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => void open()} data-reverse={documentId}>
        {t("button")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={preview === null || !isMoveReason(reason)}
        text={{
          title: t("title", { number }),
          result: preview ? t(`result.${preview.type === "RETURN" ? "RETURN" : "ISSUE"}`) : "",
          confirm: t("button"),
          danger: true,
        }}
        onConfirm={() => void run()}
      >
        {preview === null ? (
          <div className="mt-4 flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {preview.departmentName !== null && (
              <p className="text-sm leading-5">
                <span className="text-muted-foreground">{t("department")}</span>{" "}
                <span className="font-semibold">{preview.departmentName}</span>
              </p>
            )}
            <ul className="flex flex-col gap-2 text-sm leading-5" data-reverse-lines>
              {preview.lines.map((line) => (
                <li key={line.id} className="flex flex-col">
                  <span className="flex justify-between gap-3">
                    <span>{itemName(line)}</span>
                    <span className="font-semibold whitespace-nowrap tabular-nums">
                      {format.quantity(line.qty)} {line.unitShortName}
                    </span>
                  </span>
                  {line.held !== null && (
                    <span className="text-[13px] leading-[18px] text-warning" data-held>
                      {t("held", {
                        held: `${format.quantity(line.held)} ${line.unitShortName}`,
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1.5">
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
              <p
                id={`${reasonId}-hint`}
                className="text-[13px] leading-[18px] text-muted-foreground"
              >
                {t("reasonHint", {
                  min: MOVE_REASON_MIN,
                  max: MOVE_REASON_MAX,
                  count: Array.from(reason.trim()).length,
                })}
              </p>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
