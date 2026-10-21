"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import {
  type WireMoneyOrder,
  moneyPrefillAction,
  recordMoneyAction,
} from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { uploadFile } from "@/components/files/upload";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FIELD_CLASSES, Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { FILE_MIMES } from "@/domain/files";
import { parseSomOrZero } from "@/domain/money";
import {
  MONEY_ROW_KINDS,
  type MoneyRowKind,
  actionTotal,
  moneyPrefill,
} from "@/domain/money-ledger";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

// Record money on ticked orders or on one order (08-money-and-settlement.md, Money ledger;
// 11-screens-and-ux.md rule 6: "ask for confirmation, say how many orders they cover, and state
// the result"; plan of 4.3). Shown only where the server offered it (`canRecordMoney`); the server
// asks again. The dialog reads the ticked orders when it opens (moneyPrefillAction): one kind, the
// date (today in Tashkent from the server's clock), an optional document number, an optional file
// (one Manager only: decided item 5, Look first), the comment, and one block per Manager with a row
// per order, prefilled by moneyPrefill() (decided item 2, Look first) and changeable; a row left
// empty or at 0 writes nothing. The result line names the orders and the total per Manager
// (actionTotal()). A call is never retried by the screen; its client key is kept only after a call
// with no answer. After every answer the page is refreshed and the caller clears its ticks. The
// settlement screen opens it with a kind preset and its own label (Card money returned; plan of
// 4.5, decided item 14).

type Failed = { title: string; lines: { orderId: string; line: string }[] } | null;

export function RecordMoneyButton({
  orderIds,
  onAnswer,
  size,
  className,
  kind: preset = "CASH_GIVEN",
  label,
}: {
  orderIds: readonly string[];
  /** The kind the dialog opens with. */
  kind?: MoneyRowKind;
  /** The button's text, when it is not "Record money". */
  label?: string;
  onAnswer?: (failed: Failed) => void;
  size?: "sm";
  className?: string;
}) {
  const t = useTranslations("money.record");
  const tSettle = useTranslations("money.settle");
  const tKinds = useTranslations("money.kinds");
  const tMoves = useTranslations("orders.moves");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const formId = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const key = useRef<ClientKey | null>(null);
  const [asking, setAsking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [orders, setOrders] = useState<WireMoneyOrder[]>([]);
  const [kind, setKind] = useState<MoneyRowKind>(preset);
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  // What Finance typed per order and kind; an order not here shows its prefill.
  const [typed, setTyped] = useState<Record<string, string>>({});

  const prefilled = (order: WireMoneyOrder) =>
    moneyPrefill(kind, {
      plannedCash: BigInt(order.plannedCash),
      cashCount: BigInt(order.cashCount),
      handed: BigInt(order.handed),
    });
  const textOf = (order: WireMoneyOrder) =>
    typed[`${kind}:${order.id}`] ?? prefilled(order)?.toString() ?? "";
  const amountOf = (order: WireMoneyOrder) => {
    const text = textOf(order).trim();
    return text === "" ? 0n : parseSomOrZero(text);
  };
  const valid = orders.every((order) => amountOf(order) !== null);

  // One block per Manager, in the order the server gave (by name, then number).
  const blocks = new Map<string, { name: string; orders: WireMoneyOrder[] }>();
  for (const order of orders) {
    const block = blocks.get(order.ownerId) ?? { name: order.ownerName, orders: [] };
    block.orders.push(order);
    blocks.set(order.ownerId, block);
  }
  const given = [...blocks.values()]
    .map((block) => ({
      name: block.name,
      rows: block.orders
        .map((order) => ({ orderId: order.id, amount: amountOf(order) ?? 0n }))
        .filter((row) => row.amount > 0n),
    }))
    .filter((block) => block.rows.length > 0);
  const oneManager = blocks.size === 1;
  const ready =
    valid && given.length > 0 && comment.trim() !== "" && date !== "" && !uploading && !loading;

  async function open() {
    setKind(preset);
    setDocumentNo("");
    setComment("");
    setFile(null);
    setTyped({});
    setOrders([]);
    setAsking(true);
    setLoading(true);
    try {
      const answer = await moneyPrefillAction({ ids: [...orderIds] });
      if (!answer.ok) {
        toast.error(tAll(answer.error.messageKey));
        setAsking(false);
        return;
      }
      setDate(answer.data.today);
      setToday(answer.data.today);
      setOrders(answer.data.orders);
    } catch {
      toast.error(tAll("errors.network"));
      setAsking(false);
    } finally {
      setLoading(false);
    }
  }

  async function addFile(chosen: File | undefined) {
    if (!chosen) return;
    setUploading(true);
    try {
      const result = await uploadFile(chosen, "document", newClientKey());
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      setFile({ id: result.data.id, name: chosen.name });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      const amounts = Object.fromEntries(
        orders.map((order) => [order.id, (amountOf(order) ?? 0n).toString()]),
      );
      const answer = await recordMoneyAction({
        clientKey: key.current,
        orders: orders.map(({ id, version }) => ({ id, version })),
        kind,
        occurredOn: date,
        documentNo,
        fileId: oneManager ? (file?.id ?? null) : null,
        comment,
        amounts,
      });
      answered = true;
      if (answer.ok) {
        toast.success(t("done", { count: given.reduce((sum, b) => sum + b.rows.length, 0) }));
        onAnswer?.(null);
        return;
      }
      const numberOf = new Map(orders.map((order) => [order.id, order.number]));
      const fieldOf = new Map(
        (answer.error.orders ?? []).flatMap((order) =>
          order.fields ? [[order.orderId, Object.values(order.fields)[0]!] as const] : [],
        ),
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
      ).map(({ orderId, line }) => {
        const field = fieldOf.get(orderId);
        return {
          orderId,
          line: field
            ? tMoves("failedLine", { number: numberOf.get(orderId) ?? "", problem: tAll(field) })
            : line,
        };
      });
      if (lines.length === 0) {
        const field = Object.values(answer.error.fields ?? {})[0];
        toast.error(tAll(field ?? answer.error.messageKey));
        onAnswer?.(null);
        return;
      }
      if (onAnswer) onAnswer({ title: t("failedTitle", { count: lines.length }), lines });
      else toast.error(lines.map((each) => each.line).join(" "));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      if (answered) key.current = null;
      setAsking(false);
      setPending(false);
      router.refresh();
    }
  }

  const count = given.reduce((sum, block) => sum + block.rows.length, 0);
  const result =
    given.length === 0
      ? t("resultNone")
      : given
          .map((block) =>
            t("result", {
              kind: tKinds(kind),
              amount: format.money(actionTotal(block.rows)),
              count: block.rows.length,
              name: block.name,
            }),
          )
          .join(" ");

  return (
    <>
      <Button
        variant="secondary"
        pending={pending}
        onClick={() => void open()}
        size={size}
        className={className}
        data-record-money
      >
        {label ?? t("button")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={!ready}
        disabledReason={
          loading
            ? null
            : !valid
              ? tSettle("whyNot.amounts")
              : given.length === 0
                ? tSettle("whyNot.nothing")
                : date === ""
                  ? tSettle("whyNot.date")
                  : comment.trim() === ""
                    ? tSettle("whyNot.comment")
                    : uploading
                      ? tSettle("whyNot.uploading")
                      : null
        }
        text={{
          title: t("title", { count: count || orderIds.length }),
          result,
          confirm: t("confirm"),
        }}
        onConfirm={() => void save()}
      >
        <div className="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto" data-money-form>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-kind`} className="text-sm leading-5 font-semibold">
              {t("kind")}
            </label>
            <Select
              id={`${formId}-kind`}
              data-money-kind
              value={kind}
              disabled={pending}
              onChange={(event) => setKind(event.target.value as MoneyRowKind)}
            >
              {MONEY_ROW_KINDS.map((each) => (
                <option key={each} value={each}>
                  {tKinds(each)}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-date`} className="text-sm leading-5 font-semibold">
                {t("date")}
              </label>
              <DateInput
                id={`${formId}-date`}
                max={today || undefined}
                value={date}
                disabled={pending}
                onValueChange={setDate}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-doc`} className="text-sm leading-5 font-semibold">
                {t("documentNo")}
              </label>
              <Input
                id={`${formId}-doc`}
                value={documentNo}
                maxLength={100}
                disabled={pending}
                autoComplete="off"
                onChange={(event) => setDocumentNo(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-comment`} className="text-sm leading-5 font-semibold">
              {t("comment")}
            </label>
            <textarea
              id={`${formId}-comment`}
              data-money-comment
              value={comment}
              rows={2}
              maxLength={1000}
              disabled={pending}
              onChange={(event) => setComment(event.target.value)}
              className={cn(FIELD_CLASSES, "min-h-16 py-2")}
            />
          </div>
          {oneManager ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm leading-5 font-semibold">{t("file")}</span>
              <input
                ref={fileInput}
                type="file"
                accept={FILE_MIMES.join(",")}
                data-money-file
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => void addFile(event.target.files?.[0])}
              />
              {file ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setFile(null)}
                  >
                    {t("removeFile")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  icon="description"
                  pending={uploading}
                  disabled={pending}
                  onClick={() => fileInput.current?.click()}
                  className="max-sm:h-12 max-sm:w-full sm:self-start"
                >
                  {t("chooseFile")}
                </Button>
              )}
            </div>
          ) : blocks.size > 1 ? (
            <p className="text-small text-muted-foreground">{t("fileOneManager")}</p>
          ) : null}
          <section aria-label={t("rowsTitle")} className="flex flex-col gap-4">
            {loading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}
            {[...blocks].map(([ownerId, block]) => (
              <div key={ownerId} data-money-block={ownerId} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">{block.name}</h3>
                {block.orders.map((order) => {
                  const invalid = amountOf(order) === null;
                  return (
                    <div
                      key={order.id}
                      data-money-row={order.id}
                      className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <label htmlFor={`money-${order.id}`} className="flex flex-col">
                        <span className="text-sm">{order.number}</span>
                        <span className="text-small text-muted-foreground">
                          {t("rowFacts", {
                            planned: format.money(BigInt(order.plannedCash)),
                            given: format.money(BigInt(order.handed)),
                            count: format.money(BigInt(order.cashCount)),
                          })}
                        </span>
                      </label>
                      <div className="flex flex-col gap-1 sm:w-40">
                        <MoneyInput
                          id={`money-${order.id}`}
                          value={textOf(order)}
                          disabled={pending}
                          aria-invalid={invalid || undefined}
                          aria-describedby={invalid ? `money-error-${order.id}` : undefined}
                          className="text-right max-sm:h-12"
                          onValueChange={(value) =>
                            setTyped((current) => ({
                              ...current,
                              [`${kind}:${order.id}`]: value,
                            }))
                          }
                        />
                        {invalid ? (
                          <p id={`money-error-${order.id}`} className="text-small text-destructive">
                            {t("amountInvalid")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        </div>
      </ConfirmDialog>
    </>
  );
}
