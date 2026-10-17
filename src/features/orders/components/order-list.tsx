"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { selectAllOnFilterAction, tickedSummaryAction } from "@/app/(app)/orders/actions";
import { Icon } from "@/components/icon";
import { RequestStatusLabel } from "@/components/status-label";
import { toast } from "@/components/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { tickFits } from "@/domain/order-list";
import type { WireOrderGroup, WireTickedSummary } from "@/features/orders/list-wire";
import { useFormatters } from "@/i18n/use-formatters";

import { ApproveButton } from "./approve-button";
import { CopyButton } from "./copy-button";
import { ListActionBar } from "./list-action-bar";
import { type MoveKind, MoveButton } from "./move-button";

/**
 * The moves of the list's action bar besides Approve, in the table's order. Submit again is not
 * among them: sent-back orders are edited and submitted again in the drafts grid or from their
 * page (05 Drafts 5; plan of 2.11, decided item 9).
 */
const LIST_MOVES: readonly MoveKind[] = ["SEND_BACK", "REJECT", "CANCEL", "TAKE_BACK"];

// The group rows of /orders (05-order-request-form.md, Group rows 1 to 3; Ticking and filters;
// 11-screens-and-ux.md, Order list layout 2 and 4; Rules for a smooth feel 8, 13; plan of 2.8).
// One row per branch, subtype and status, opening to its orders; a tick box on each. Ticking a
// group row ticks every order in it (Group rows 3). The ticks live here and survive a change of
// page; the page keys this component by its filters, so a change of filter or sort clears them
// (review of the plan, correction 1). The count, totals and actions of the ticked orders are the
// server's (tickedSummary); this component adds nothing up and decides no permission. An action
// sends each order with the version the screen last showed it at (06 rule 7; plan of 2.10).

export function OrderList({
  groups,
  page,
  pages,
  total,
  query,
  hrefOf,
}: {
  groups: WireOrderGroup[];
  page: number;
  pages: number;
  /** How many group rows match. */
  total: number;
  /** The address query of the filters and sort, without the list's page. */
  query: string;
  /** The address of a page of the list, every other parameter kept. */
  hrefOf: Record<number, string>;
}) {
  const t = useTranslations("orders.list");
  const tPager = useTranslations("pager");
  const tCommon = useTranslations("common");
  const format = useFormatters();
  const router = useRouter();
  const [ticked, setTicked] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // The server's answer, with the ticks it answers for: an older answer is never shown.
  const [answered, setAnswered] = useState<{ ids: string; summary: WireTickedSummary } | null>(
    null,
  );
  const [matching, setMatching] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [failed, setFailed] = useState<{
    title: string;
    lines: { orderId: string; line: string }[];
  } | null>(null);
  const asked = useRef(0);
  // The version of each order as the screen last showed it, also of ticks on another page.
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    for (const group of groups) {
      for (const order of group.orders) seen.current.set(order.id, order.version);
    }
  }, [groups]);

  // The bar reads the server again whenever the ticks change (decided item 16).
  useEffect(() => {
    const call = (asked.current += 1);
    if (ticked.length === 0) return;
    void tickedSummaryAction({ ids: ticked }).then((answer) => {
      if (call !== asked.current) return;
      if (!answer.ok) {
        toast.error(t("summaryFailed"));
        return;
      }
      if (answer.data.missing.length > 0) {
        // An order changed or left the user's view: drop it and refresh (06 rule 7).
        const gone = new Set(answer.data.missing);
        setTicked((current) => current.filter((id) => !gone.has(id)));
        toast.error(t("refreshed"));
        router.refresh();
        return;
      }
      setAnswered({ ids: ticked.join(","), summary: answer.data });
    });
  }, [ticked, router, t]);

  function tick(ids: readonly string[], on: boolean) {
    setMatching(null);
    if (!on) {
      const off = new Set(ids);
      setTicked((current) => current.filter((id) => !off.has(id)));
      return;
    }
    if (!tickFits(ticked, ids)) {
      toast.error(t("tooMany"));
      return;
    }
    setTicked((current) => [...new Set([...current, ...ids])]);
  }

  async function selectAll() {
    setSelecting(true);
    try {
      const answer = await selectAllOnFilterAction({ query });
      if (!answer.ok) {
        toast.error(t("summaryFailed"));
        return;
      }
      for (const order of answer.data.orders) seen.current.set(order.id, order.version);
      setTicked(answer.data.orders.map((order) => order.id));
      setMatching(answer.data.matching);
    } finally {
      setSelecting(false);
    }
  }

  function clear() {
    setTicked([]);
    setMatching(null);
  }

  const tickedSet = new Set(ticked);
  // The orders a refused action named stay marked until the next answer (decided item 6).
  const refusedSet = new Set(failed?.lines.map((line) => line.orderId) ?? []);
  const summary = answered?.ids === ticked.join(",") ? answered.summary : null;

  return (
    <div className="flex flex-col gap-4">
      {failed && (
        <section
          role="alert"
          data-approve-failed
          className="flex flex-col gap-2 rounded-xl border border-destructive bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[15px] leading-[22px] font-bold text-destructive">
              {failed.title}
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFailed(null)}>
              {tCommon("close")}
            </Button>
          </div>
          <ul className="flex flex-col gap-1 text-[15px] leading-[22px]">
            {failed.lines.map(({ orderId, line }) => (
              <li key={orderId} data-failed-order={orderId}>
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{t("groupCount", { count: total })}</span>
        <Button type="button" variant="secondary" pending={selecting} onClick={selectAll}>
          {t("selectAll")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-card max-sm:overflow-visible max-sm:bg-transparent">
        <table className="w-full border-collapse text-sm max-sm:block">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="bg-muted text-left text-[13px] leading-[18px] text-muted-foreground max-sm:hidden">
            <tr>
              <th scope="col" className="w-12 px-3 py-2 font-semibold">
                <span className="sr-only">{t("columns.tick")}</span>
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("columns.product")}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("columns.status")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {t("columns.quantity")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {t("columns.total")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {t("columns.count")}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("columns.neededBy")}
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <GroupRows
              key={group.key}
              group={group}
              open={open.has(group.key)}
              onToggle={() =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
              ticked={tickedSet}
              refused={refusedSet}
              onTick={tick}
            />
          ))}
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label={tPager("label")} className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={hrefOf[page - 1]!} className={buttonVariants({ variant: "secondary" })}>
              {tPager("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">{tPager("pageOf", { page, pages })}</span>
          {page < pages ? (
            <Link href={hrefOf[page + 1]!} className={buttonVariants({ variant: "secondary" })}>
              {tPager("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      {ticked.length > 0 && (
        <ListActionBar
          summary={summary}
          tickedCount={ticked.length}
          matching={matching}
          onClear={clear}
          actions={
            summary ? (
              <>
                {summary.actions.includes("APPROVE") ? (
                  <ApproveButton
                    orders={summary.orders}
                    versionOf={(id) => seen.current.get(id) ?? 0}
                    total={format.money(BigInt(summary.totals.grand))}
                    onAnswer={(answer) => {
                      setFailed(answer);
                      clear();
                    }}
                    size="sm"
                    className="max-sm:flex-1"
                  />
                ) : null}
                {LIST_MOVES.filter((move) => summary.actions.includes(move)).map((move) => (
                  <MoveButton
                    key={move}
                    move={move}
                    orders={summary.orders}
                    versionOf={(id) => seen.current.get(id) ?? 0}
                    onAnswer={(answer) => {
                      setFailed(answer);
                      clear();
                    }}
                    size="sm"
                    className="max-sm:flex-1"
                  />
                ))}
                {summary.recordTrip ? (
                  // One shop visit for the ticked Open orders (07 One trip, many orders; plan of
                  // 3.4): the form takes the user's recordable orders and asks the server again.
                  <Link
                    href={`/orders/purchase?ids=${summary.orders.map((order) => order.id).join(",")}`}
                    data-record-trip
                    className={cn(buttonVariants({ size: "sm" }), "max-sm:flex-1")}
                  >
                    {t("bar.recordPurchase")}
                  </Link>
                ) : null}
                {summary.canCopy ? (
                  <CopyButton
                    orders={summary.orders}
                    versionOf={(id) => seen.current.get(id) ?? 0}
                    onAnswer={(answer) => {
                      setFailed(answer);
                      clear();
                    }}
                    size="sm"
                    className="max-sm:flex-1"
                  />
                ) : null}
              </>
            ) : null
          }
        />
      )}
    </div>
  );
}

function GroupRows({
  group,
  open,
  onToggle,
  ticked,
  refused,
  onTick,
}: {
  group: WireOrderGroup;
  open: boolean;
  onToggle: () => void;
  ticked: ReadonlySet<string>;
  /** Orders the last refused action named (06 rule 8; decided item 6). */
  refused: ReadonlySet<string>;
  onTick: (ids: readonly string[], on: boolean) => void;
}) {
  const t = useTranslations("orders.list");
  const tOrders = useTranslations("orders");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  const ids = group.orders.map((order) => order.id);
  const tickedHere = ids.filter((id) => ticked.has(id)).length;
  const all = tickedHere === ids.length;
  const some = tickedHere > 0 && !all;
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = some;
  }, [some]);

  const product = group.subtypeName
    ? `${group.productName}, ${group.subtypeName}`
    : group.productName;
  const ordersId = `group-${group.key.replaceAll(":", "-")}`;
  const cell = "px-3 py-3 align-top max-sm:p-0";

  return (
    <tbody
      data-group={group.key}
      className="border-t border-border first-of-type:border-t-0 max-sm:mb-3 max-sm:block max-sm:rounded-xl max-sm:border-t-0 max-sm:bg-card max-sm:p-4"
    >
      <tr className="max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:gap-y-2">
        <td className={cn(cell, "max-sm:row-span-6")}>
          <label className="flex size-11 cursor-pointer items-center justify-center sm:size-6">
            <input
              ref={box}
              type="checkbox"
              checked={all}
              onChange={(event) => onTick(ids, event.target.checked)}
              aria-label={t("tickGroup", { product })}
              className="size-5 accent-foreground sm:size-4"
            />
          </label>
        </td>
        <td className={cell}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={ordersId}
            onClick={onToggle}
            aria-label={t(open ? "hideOrders" : "showOrders", { product })}
            className="flex min-h-11 items-start gap-2 text-left font-semibold sm:min-h-0"
          >
            <Icon name={open ? "expand_more" : "chevron_right"} className="shrink-0" />
            <span className="flex flex-col gap-1">
              <span>{product}</span>
              <span className="text-[13px] leading-4 font-normal text-muted-foreground">
                {group.branchCode}
              </span>
            </span>
          </button>
        </td>
        <td className={cell}>
          <span className="flex flex-wrap items-center gap-2">
            <RequestStatusLabel status={group.status} />
            {group.summary.urgent && (
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-destructive">
                <Icon name="warning" size={16} />
                {t("urgent")}
              </span>
            )}
            {group.summary.overdue && (
              <span
                data-overdue
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-warning"
              >
                <Icon name="schedule" size={16} />
                {tOrders("overdue")}
              </span>
            )}
          </span>
        </td>
        <td className={cn(cell, "text-right tabular-nums max-sm:text-left")}>
          <span className="flex gap-1 max-sm:gap-2 sm:justify-end">
            <span className="text-muted-foreground sm:hidden">{t("columns.quantity")}</span>
            <span>{format.quantity(group.summary.quantity)}</span>
            <span>{group.unitShortName}</span>
          </span>
        </td>
        <td className={cn(cell, "text-right max-sm:text-left")}>
          <span className="flex flex-col items-end gap-1 max-sm:items-start">
            <span className="font-semibold whitespace-nowrap tabular-nums" data-cell="group-total">
              {format.money(BigInt(group.summary.totals.grand))}
            </span>
            {group.summary.priceHint !== null && (
              <span className="text-[13px] leading-4 whitespace-nowrap text-warning">
                {tOrders("priceHint", {
                  percent: BigInt(group.summary.priceHint) as unknown as number,
                })}
              </span>
            )}
          </span>
        </td>
        <td className={cn(cell, "text-right tabular-nums max-sm:text-left")}>
          {t("orderCount", { count: group.summary.count })}
        </td>
        <td className={cn(cell, "whitespace-nowrap tabular-nums")}>
          <span className="flex gap-2">
            <span className="text-muted-foreground sm:hidden">{t("columns.neededBy")}</span>
            <span>{format.date(group.summary.earliestNeededBy)}</span>
          </span>
        </td>
      </tr>
      {open && (
        <tr id={ordersId} className="max-sm:mt-3 max-sm:block">
          <td colSpan={7} className="px-3 pb-4 max-sm:block max-sm:p-0">
            <table className="w-full border-collapse text-[13px] leading-[18px] max-sm:block">
              <caption className="sr-only">{t("ordersOf", { product })}</caption>
              <thead className="text-left text-muted-foreground max-sm:hidden">
                <tr>
                  <th scope="col" className="w-12 py-1 pr-2 font-semibold">
                    <span className="sr-only">{t("columns.tick")}</span>
                  </th>
                  {(
                    [
                      "number",
                      "department",
                      "quantity",
                      "stockAtSubmit",
                      "stockNow",
                      "price",
                      "paymentType",
                      "neededBy",
                      "owner",
                      "submitted",
                    ] as const
                  ).map((column) => (
                    <th key={column} scope="col" className="py-1 pr-3 font-semibold">
                      {t(`columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
                {group.orders.map((order) => (
                  <tr
                    key={order.id}
                    data-order={order.id}
                    data-refused={refused.has(order.id) || undefined}
                    className="border-t border-border data-refused:bg-destructive-bg max-sm:grid max-sm:grid-cols-2 max-sm:gap-1 max-sm:rounded-lg max-sm:bg-muted max-sm:p-3"
                  >
                    <td className="py-2 pr-2 max-sm:col-span-2">
                      <label className="flex size-11 cursor-pointer items-center justify-center sm:size-6">
                        <input
                          type="checkbox"
                          checked={ticked.has(order.id)}
                          onChange={(event) => onTick([order.id], event.target.checked)}
                          aria-label={t("tickOrder", { number: order.number })}
                          className="size-5 accent-foreground sm:size-4"
                        />
                      </label>
                    </td>
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">
                      {/* The order page (plan of 2.9; progress 2.8, "For 2.9"). */}
                      <Link
                        href={`/orders/${order.id}`}
                        className="inline-flex min-h-11 items-center underline-offset-2 hover:underline sm:min-h-0"
                      >
                        {order.number}
                      </Link>
                      {order.revision > 1 && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {tOrders("revision", { revision: order.revision })}
                        </span>
                      )}
                      {order.priority === "URGENT" && (
                        <span className="ml-2 text-destructive">{t("urgent")}</span>
                      )}
                      {order.overdue && (
                        <span
                          data-overdue
                          className="ml-2 inline-flex items-center gap-1 text-warning"
                        >
                          <Icon name="schedule" size={16} />
                          {tOrders("overdue")}
                        </span>
                      )}
                      {refused.has(order.id) && (
                        <span className="ml-2 inline-flex items-center gap-1 text-destructive">
                          <Icon name="error" size={16} />
                          {t("refusedMark")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{order.departmentName}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {format.quantity(order.quantity)} {group.unitShortName}
                    </td>
                    {/* Stock at submit and now (06 rule 10; plan of 2.10, decided item 4). */}
                    {[
                      ["stockAtSubmit", order.stockAtSubmit],
                      ["stockNow", order.stockNow],
                    ].map(([column, stock]) => (
                      <td
                        key={column}
                        data-cell={column!}
                        className="py-2 pr-3 tabular-nums sm:whitespace-nowrap"
                      >
                        <span className="text-muted-foreground sm:hidden">
                          {t(`columns.${column as "stockAtSubmit" | "stockNow"}`)}{" "}
                        </span>
                        {stock === null
                          ? t("noStock")
                          : `${format.quantity(stock!)} ${group.unitShortName}`}
                      </td>
                    ))}
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {format.money(BigInt(order.price))}
                      {order.priceHint !== null && (
                        <span className="block text-warning">
                          {tOrders("priceHint", {
                            percent: BigInt(order.priceHint) as unknown as number,
                          })}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{tPayment(order.paymentType)}</td>
                    <td className="py-2 pr-3 tabular-nums">{format.date(order.neededBy)}</td>
                    <td className="py-2 pr-3">{order.ownerName}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {format.date(order.submittedAt)} {format.time(order.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </tbody>
  );
}
