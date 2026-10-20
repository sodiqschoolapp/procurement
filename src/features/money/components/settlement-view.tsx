"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { confirmSettlementAction, settleCashAction } from "@/app/(app)/orders/actions";
import { type ClientKey, newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { uploadFile } from "@/components/files/upload";
import { NoReceiptLabel } from "@/components/status-label";
import { toast } from "@/components/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { FIELD_CLASSES, Input } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { FILE_MIMES } from "@/domain/files";
import { parseSomOrZero } from "@/domain/money";
import { settlementCashRows, settlementNet } from "@/domain/money-ledger";
import { MoveButton } from "@/features/orders/components/move-button";
import { moveFailureLines } from "@/features/orders/move-lines";
import { useFormatters } from "@/i18n/use-formatters";

import type { WireSettlement, WireSettlementOrder } from "../settlement-wire";
import { RecordMoneyButton } from "./record-money-button";

// Finance's settlement screen (08-money-and-settlement.md, Closing 2 with its table, 4 and the
// last paragraph; Money ledger 1 to 3; 11-screens-and-ux.md rule 6; plan of 4.5). A block per
// Manager, and inside it a block for each payment type used: Cash (given, spent, returned, paid
// back, count; a Receive or Pay row prefilled with the count and changeable, partial amounts
// allowed; the net from settlementNet() over the rows as typed, never a sum of its own: review of
// the plan, correction 3), Bank transfer (planned, transferred, received; Confirmed with a note
// when they differ) and Corporate card (planned, charged, Left or Over; Confirmed; Card money
// returned through Record money). Per order: its link, its cancelled records each linked, "No
// receipt", and Send back for correction. One Save writes one settlement action per Manager, all
// in one transaction; its confirmation names the orders, the Managers and each net. Every figure
// comes from the server; the server asks every action again. On a phone each order is a card.
// Close (08 Closing 3; plan of 4.6) acts on every order the screen shows.

type Failed = { title: string; lines: { orderId: string; line: string }[] } | null;

const money = (text: string) => BigInt(text);

export function SettlementView({ settlement }: { settlement: WireSettlement }) {
  const t = useTranslations("money.settle");
  const tMoves = useTranslations("orders.moves");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const formId = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const key = useRef<ClientKey | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [date, setDate] = useState(settlement.today);
  const [documentNo, setDocumentNo] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<Failed>(null);

  const allOrders = settlement.managers.flatMap((manager) => manager.orders);
  const numberOf = new Map(allOrders.map((order) => [order.id, order.number]));
  const textOf = (order: WireSettlementOrder) => typed[order.id] ?? order.prefill?.amount ?? "";
  const amountOf = (order: WireSettlementOrder) => {
    const text = textOf(order).trim();
    return text === "" ? 0n : parseSomOrZero(text);
  };
  const cashOrders = allOrders.filter((order) => order.prefill !== null);
  const valid = cashOrders.every((order) => amountOf(order) !== null);
  // The rows above 0, one block per Manager: settlementCashRows() of the domain.
  const blocks = valid
    ? settlementCashRows(
        settlement.managers.flatMap((manager) =>
          manager.orders.flatMap((order) =>
            order.prefill
              ? [
                  {
                    id: order.id,
                    ownerId: manager.id,
                    kind: order.prefill.kind,
                    amount: amountOf(order)!,
                  },
                ]
              : [],
          ),
        ),
      )
    : [];
  const nameOf = new Map(settlement.managers.map((manager) => [manager.id, manager.name]));
  const netLine = (managerId: string) => {
    const block = blocks.find((each) => each.managerId === managerId);
    const net = settlementNet(block?.rows ?? []);
    return t(`net.${net.direction}`, {
      name: nameOf.get(managerId) ?? "",
      amount: format.money(net.amount),
    });
  };
  const rowCount = blocks.reduce((sum, block) => sum + block.rows.length, 0);
  // Only the orders with a row above 0 are settled; the others get no event (review of 4.5).
  const settled = new Set(blocks.flatMap((block) => block.rows.map((row) => row.orderId)));
  const sentOrders = cashOrders.filter((order) => settled.has(order.id));
  const oneManager = settlement.managers.length === 1;
  const ready =
    valid && rowCount > 0 && comment.trim() !== "" && date !== "" && !uploading && !pending;

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
      const answer = await settleCashAction({
        clientKey: key.current,
        orders: sentOrders.map(({ id, version }) => ({ id, version })),
        occurredOn: date,
        documentNo,
        fileId: oneManager ? (file?.id ?? null) : null,
        comment,
        rows: Object.fromEntries(
          sentOrders.map((order) => [
            order.id,
            { kind: order.prefill!.kind, amount: amountOf(order)!.toString() },
          ]),
        ),
      });
      answered = true;
      if (answer.ok) {
        toast.success(t("done", { count: rowCount }));
        setTyped({});
        setComment("");
        setDocumentNo("");
        setFile(null);
        setFailed(null);
        return;
      }
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
        return;
      }
      setFailed({ title: t("failedTitle", { count: lines.length }), lines });
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      if (answered) key.current = null;
      setAsking(false);
      setPending(false);
      router.refresh();
    }
  }

  const fact = (label: string, value: string, name?: string) => (
    <div className="flex flex-col gap-0.5" data-fact={name}>
      <dt className="text-[13px] leading-[18px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] leading-[22px] tabular-nums">{value}</dd>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6" data-settlement>
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          {t("subtitle", {
            count: allOrders.length,
            managers: settlement.managers.length,
            branch: settlement.branchCode,
          })}
        </p>
      </header>

      {failed ? (
        <section
          role="alert"
          data-settle-failed
          className="flex flex-col gap-1 rounded-xl border border-destructive bg-card p-4"
        >
          <h2 className="text-[15px] leading-[22px] font-bold">{failed.title}</h2>
          {failed.lines.map((each) => (
            <p key={each.orderId} className="text-[15px] leading-[22px]">
              {each.line}
            </p>
          ))}
        </section>
      ) : null}

      {settlement.managers.map((manager) => {
        const cash = manager.orders.filter((order) => order.cash !== null);
        const transfer = manager.orders.filter((order) => order.transfer !== null);
        const card = manager.orders.filter((order) => order.card !== null);
        return (
          <section
            key={manager.id}
            data-settle-manager={manager.id}
            aria-labelledby={`manager-${manager.id}`}
            className="flex flex-col gap-6 rounded-xl bg-card p-4 sm:p-6"
          >
            <h2 id={`manager-${manager.id}`} className="text-[22px] leading-7 font-bold">
              {manager.name}
            </h2>

            <ul className="flex flex-col divide-y divide-border" aria-label={t("orders")}>
              {manager.orders.map((order) => (
                <li
                  key={order.id}
                  data-settle-order={order.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/orders/${order.id}`}
                      className="inline-flex min-h-11 items-center text-[15px] leading-[22px] font-semibold underline-offset-4 hover:underline sm:min-h-0"
                    >
                      {order.number}
                    </Link>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {order.subtypeName
                        ? `${order.productName} · ${order.subtypeName}`
                        : order.productName}
                    </span>
                    {order.overspend ? (
                      <p
                        data-overspend={order.overspend.acknowledgedBy ? "acknowledged" : "waits"}
                        className={cn(
                          "flex items-start gap-1.5 text-[13px] leading-[18px]",
                          order.overspend.acknowledgedBy ? "text-muted-foreground" : "text-warning",
                        )}
                      >
                        <Icon
                          name={order.overspend.acknowledgedBy ? "check_circle" : "warning"}
                          size={16}
                          className="mt-px shrink-0"
                        />
                        {order.overspend.acknowledgedBy
                          ? t("overspend.acknowledged", {
                              amount: format.money(money(order.overspend.over)),
                              percent: order.overspend.percent ?? "—",
                              name: order.overspend.acknowledgedBy,
                            })
                          : t("overspend.waits", {
                              amount: format.money(money(order.overspend.over)),
                              percent: order.overspend.percent ?? "—",
                            })}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {order.noReceipt ? <NoReceiptLabel /> : null}
                      {order.cancelledRecords.length > 0 ? (
                        <span
                          data-cancelled-records={order.cancelledRecords.length}
                          className="flex flex-wrap items-center gap-x-2 text-[13px] leading-[18px]"
                        >
                          {t("cancelled", { count: order.cancelledRecords.length })}
                          {order.cancelledRecords.map((record, index) => (
                            <Link
                              key={record}
                              href={`/orders/${order.id}?tab=purchases#purchase-${record}`}
                              className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4 sm:min-h-0"
                            >
                              {t("cancelledLink", { index: index + 1 })}
                            </Link>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <MoveButton
                    move="SEND_BACK_FOR_CORRECTION"
                    orders={[{ id: order.id, number: order.number }]}
                    versionOf={() => order.version}
                    onAnswer={setFailed}
                    size="sm"
                    className="max-sm:h-11 max-sm:w-full"
                  />
                </li>
              ))}
            </ul>

            {cash.length > 0 ? (
              <section
                aria-labelledby={`cash-${manager.id}`}
                data-settle-block="CASH"
                className="flex flex-col gap-3"
              >
                <h3 id={`cash-${manager.id}`} className="text-[17px] leading-6 font-bold">
                  {t("cash.title")}
                </h3>
                <ul className="flex flex-col divide-y divide-border">
                  {cash.map((order) => {
                    const figures = order.cash!;
                    const invalid = order.prefill !== null && amountOf(order) === null;
                    return (
                      <li
                        key={order.id}
                        data-cash-order={order.id}
                        className="flex flex-col gap-3 py-3 lg:flex-row lg:items-end lg:justify-between"
                      >
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                          {fact(t("number"), order.number)}
                          {fact(t("cash.given"), format.money(money(figures.given)))}
                          {fact(t("cash.spent"), format.money(money(figures.spent)))}
                          {fact(t("cash.returned"), format.money(money(figures.returned)))}
                          {fact(t("cash.paidBack"), format.money(money(figures.paidBack)))}
                          {fact(t("cash.count"), format.money(money(figures.count)), "count")}
                        </dl>
                        {order.prefill ? (
                          <div className="flex flex-col gap-1 lg:w-48">
                            <label
                              htmlFor={`settle-${order.id}`}
                              className="text-sm leading-5 font-semibold"
                            >
                              {t(`cash.${order.prefill.kind}`)}
                            </label>
                            <Input
                              id={`settle-${order.id}`}
                              data-settle-amount={order.id}
                              inputMode="numeric"
                              autoComplete="off"
                              value={textOf(order)}
                              disabled={pending}
                              aria-invalid={invalid || undefined}
                              aria-describedby={invalid ? `settle-error-${order.id}` : undefined}
                              className="text-right tabular-nums max-sm:h-12"
                              onChange={(event) =>
                                setTyped((current) => ({
                                  ...current,
                                  [order.id]: event.target.value,
                                }))
                              }
                            />
                            {invalid ? (
                              <p
                                id={`settle-error-${order.id}`}
                                className="text-[13px] leading-[18px] text-destructive"
                              >
                                {t("amountInvalid")}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-[15px] leading-[22px] text-muted-foreground">
                            {t("cash.settled")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p data-settle-net={manager.id} className="text-[17px] leading-6 font-bold">
                  {netLine(manager.id)}
                </p>
              </section>
            ) : null}

            {transfer.length > 0 ? (
              <section
                aria-labelledby={`transfer-${manager.id}`}
                data-settle-block="TRANSFER"
                className="flex flex-col gap-3"
              >
                <h3 id={`transfer-${manager.id}`} className="text-[17px] leading-6 font-bold">
                  {t("transfer.title")}
                </h3>
                <ul className="flex flex-col divide-y divide-border">
                  {transfer.map((order) => (
                    <TransferRow key={order.id} order={order} onFailed={setFailed} />
                  ))}
                </ul>
              </section>
            ) : null}

            {card.length > 0 ? (
              <section
                aria-labelledby={`card-${manager.id}`}
                data-settle-block="CARD"
                className="flex flex-col gap-3"
              >
                <h3 id={`card-${manager.id}`} className="text-[17px] leading-6 font-bold">
                  {t("card.title")}
                </h3>
                <ul className="flex flex-col divide-y divide-border">
                  {card.map((order) => {
                    const figures = order.card!;
                    const difference = money(figures.difference);
                    return (
                      <li
                        key={order.id}
                        data-card-order={order.id}
                        className="flex flex-col gap-3 py-3 lg:flex-row lg:items-end lg:justify-between"
                      >
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {fact(t("number"), order.number)}
                          {fact(t("card.planned"), format.money(money(figures.planned)))}
                          {fact(t("card.charged"), format.money(money(figures.charged)))}
                          {fact(
                            t("card.difference"),
                            difference < 0n
                              ? t("card.over", { amount: format.money(-difference) })
                              : t("card.left", { amount: format.money(difference) }),
                            "difference",
                          )}
                        </dl>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <ConfirmBox
                            order={order}
                            block="CARD"
                            confirmed={figures.confirmed}
                            ticked={figures.confirmed}
                            note={null}
                            needsNote={false}
                            onFailed={setFailed}
                          />
                          {order.canRecordMoney ? (
                            <RecordMoneyButton
                              orderIds={[order.id]}
                              kind="CARD_RETURNED"
                              label={t("card.returned")}
                              onAnswer={setFailed}
                              size="sm"
                              className="max-sm:h-11 max-sm:w-full"
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </section>
        );
      })}

      {cashOrders.length > 0 ? (
        <section
          aria-labelledby={`${formId}-save`}
          data-settle-form
          className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6"
        >
          <h2 id={`${formId}-save`} className="text-[17px] leading-6 font-bold">
            {t("saveTitle")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-date`} className="text-sm leading-5 font-semibold">
                {t("date")}
              </label>
              <Input
                id={`${formId}-date`}
                type="date"
                value={date}
                disabled={pending}
                onChange={(event) => setDate(event.target.value)}
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
              data-settle-comment
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
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => void addFile(event.target.files?.[0])}
              />
              {file ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[15px] leading-[22px]">{file.name}</span>
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
          ) : (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {t("fileOneManager")}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/orders"
              className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
            >
              {t("back")}
            </Link>
            <Button
              data-settle-save
              disabled={!ready}
              pending={pending}
              onClick={() => setAsking(true)}
              className="max-sm:h-12"
            >
              {t("save")}
            </Button>
          </div>
        </section>
      ) : null}

      {/* 08 Closing 3: Close of every order the screen shows; the server names those not ready. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end" data-settle-close>
        <MoveButton
          move="CLOSE"
          variant="default"
          orders={allOrders.map((order) => ({ id: order.id, number: order.number }))}
          versionOf={(id) => allOrders.find((order) => order.id === id)?.version ?? 0}
          onAnswer={setFailed}
          className="max-sm:h-12 max-sm:w-full"
        />
      </div>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={!ready}
        text={{
          title: t("confirmTitle", { count: rowCount }),
          result: [
            t("confirmResult", { count: rowCount, managers: blocks.length }),
            ...blocks.map((block) => netLine(block.managerId)),
          ].join(" "),
          confirm: t("save"),
        }}
        onConfirm={() => void save()}
      />
    </div>
  );
}

/** One order of the Bank transfer block: its figures, the note and Confirmed. */
function TransferRow({
  order,
  onFailed,
}: {
  order: WireSettlementOrder;
  onFailed: (failed: Failed) => void;
}) {
  const t = useTranslations("money.settle");
  const format = useFormatters();
  const figures = order.transfer!;
  const [note, setNote] = useState(figures.note ?? "");
  return (
    <li
      data-transfer-order={order.id}
      className="flex flex-col gap-3 py-3 lg:flex-row lg:items-end lg:justify-between"
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[13px] leading-[18px] text-muted-foreground">{t("number")}</dt>
          <dd className="text-[15px] leading-[22px]">{order.number}</dd>
        </div>
        {(["planned", "transferred", "received"] as const).map((name) => (
          <div key={name} className="flex flex-col gap-0.5" data-fact={name}>
            <dt className="text-[13px] leading-[18px] text-muted-foreground">
              {t(`transfer.${name}`)}
            </dt>
            <dd className="text-[15px] leading-[22px] tabular-nums">
              {format.money(BigInt(figures[name]))}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-3 lg:w-80">
        <div className="flex flex-col gap-1">
          <label htmlFor={`note-${order.id}`} className="text-sm leading-5 font-semibold">
            {figures.needsNote ? t("transfer.noteRequired") : t("transfer.note")}
          </label>
          <textarea
            id={`note-${order.id}`}
            data-transfer-note={order.id}
            value={note}
            rows={2}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            className={cn(FIELD_CLASSES, "min-h-16 py-2")}
          />
        </div>
        <ConfirmBox
          order={order}
          block="TRANSFER"
          confirmed={figures.confirmed}
          ticked={figures.ticked}
          note={note}
          needsNote={figures.needsNote}
          onFailed={onFailed}
        />
      </div>
    </li>
  );
}

/**
 * "Confirmed" of one order's transfer or card block (08 Closing 2): each change is saved at once
 * through confirmSettlementAction, which asks the server again; a transfer that differs needs a
 * note first. A tick whose amounts changed since (decided item 9, Look first) shows as not
 * confirmed, with the line that says why.
 */
function ConfirmBox({
  order,
  block,
  confirmed,
  ticked,
  note,
  needsNote,
  onFailed,
}: {
  order: WireSettlementOrder;
  block: "TRANSFER" | "CARD";
  confirmed: boolean;
  ticked: boolean;
  note: string | null;
  needsNote: boolean;
  onFailed: (failed: Failed) => void;
}) {
  const t = useTranslations("money.settle");
  const tAll = useTranslations();
  const router = useRouter();
  const key = useRef<ClientKey | null>(null);
  const [pending, setPending] = useState(false);
  const blocked = !confirmed && needsNote && (note ?? "").trim() === "";

  async function change(next: boolean) {
    setPending(true);
    key.current ??= newClientKey();
    let answered = false;
    try {
      const answer = await confirmSettlementAction({
        clientKey: key.current,
        orders: [{ id: order.id, version: order.version }],
        block,
        confirmed: next,
        ...(block === "TRANSFER" && next ? { notes: { [order.id]: note ?? "" } } : {}),
      });
      answered = true;
      if (answer.ok) {
        onFailed(null);
        return;
      }
      const field =
        Object.values(answer.error.orders?.[0]?.fields ?? {})[0] ??
        Object.values(answer.error.fields ?? {})[0];
      toast.error(tAll(field ?? answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      if (answered) key.current = null;
      setPending(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-11 min-w-11 items-center gap-3 text-[15px] leading-[22px] font-semibold sm:min-h-0">
        <input
          type="checkbox"
          data-confirm={`${block}:${order.id}`}
          checked={confirmed}
          disabled={pending || blocked}
          aria-describedby={ticked && !confirmed ? `stale-${block}-${order.id}` : undefined}
          onChange={(event) => void change(event.target.checked)}
          className="size-5 accent-foreground sm:size-4"
        />
        {t("confirmed")}
      </label>
      {ticked && !confirmed ? (
        <p
          id={`stale-${block}-${order.id}`}
          className="text-[13px] leading-[18px] text-muted-foreground"
        >
          {t("transfer.changed")}
        </p>
      ) : null}
    </div>
  );
}
