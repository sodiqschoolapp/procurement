"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { selectAllOnFilterAction, tickedSummaryAction } from "@/app/(app)/orders/actions";
import { EmptyState } from "@/components/empty-state";
import { rowClick } from "@/components/row-links";
import { Icon } from "@/components/icon";
import { ListColourLabel, RequestStatusLabel } from "@/components/status-label";
import { toast } from "@/components/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { tickFits } from "@/domain/order-list";
import type { Role } from "@/domain/permissions";
import type { WireListOrder, WireOrderGroup, WireTickedSummary } from "@/features/orders/list-wire";
import { useFormatters } from "@/i18n/use-formatters";

import { ApproveButton } from "./approve-button";
import { CopyButton } from "./copy-button";
import { RecordMoneyButton } from "@/features/money/components/record-money-button";

import { ListActionBar } from "./list-action-bar";
import { MoveOwnerButton } from "./move-owner-button";
import { MoveButton, type StatusMoveKind } from "./move-button";
import { waitsOn } from "./waits-on";

/**
 * The moves of the list's action bar besides Approve, in the table's order. Submit again is not
 * among them: sent-back orders are edited and submitted again in the drafts grid or from their
 * page (05 Drafts 5; plan of 2.11, decided item 9).
 */
const LIST_MOVES: readonly StatusMoveKind[] = [
  "SEND_BACK",
  "REJECT",
  "CANCEL",
  "TAKE_BACK",
  "CLOSE_EXACT",
  "SEND_TO_SETTLEMENT",
  "SEND_BACK_FOR_CORRECTION",
  "CLOSE",
  "REOPEN",
];

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
  role,
  meId,
  turnBranchIds,
  empty,
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
  /** The person's role and id: which rows wait on this person (a mark only, never a right). */
  role: Role;
  meId: string;
  /** A Manager's branches where they may add and send orders; null for the other roles. */
  turnBranchIds: readonly string[] | null;
  /** The empty page's texts, shown when no group row matches (11 rule 12). */
  empty: { title: string; line: string };
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

  // A refusal stays on the screen when the refresh after it empties the list: two Heads approve
  // the same orders, and the second one's list no longer holds them (15 S8; plan of 9.1c).
  const failure = failed && (
    <section
      role="alert"
      data-approve-failed
      className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive-bg p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-destructive">{failed.title}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setFailed(null)}>
          {tCommon("close")}
        </Button>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {failed.lines.map(({ orderId, line }) => (
          <li key={orderId} data-failed-order={orderId}>
            {line}
          </li>
        ))}
      </ul>
    </section>
  );

  if (total === 0) {
    return (
      <div className="flex flex-col gap-4">
        {failure}
        <EmptyState icon="receipt_long" title={empty.title} line={empty.line} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {failure}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-muted-foreground">
          {t("groupCount", { count: total })}
        </span>
        <Button type="button" variant="ghost" size="sm" pending={selecting} onClick={selectAll}>
          {t("selectAll")}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card max-sm:border-0 max-sm:bg-transparent">
        {/* A click on a row is a click on its one link or toggle (row-links.tsx). */}
        <table onClick={rowClick} className="w-full border-collapse text-sm max-sm:block">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="border-b border-border text-left text-xs text-muted-foreground max-sm:hidden">
            <tr>
              <th scope="col" className="w-12 py-2.5 pl-4 font-medium">
                <span className="sr-only">{t("columns.tick")}</span>
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t("columns.product")}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t("columns.status")}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {t("columns.quantity")}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {t("columns.price")}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {t("columns.total")}
              </th>
              <th scope="col" className="w-14 py-2.5 pr-4">
                <span className="sr-only">{t("columns.orders")}</span>
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
              yours={waitsOn(group, role, meId, turnBranchIds)}
            />
          ))}
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label={tPager("label")} className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={hrefOf[page - 1]!} className={buttonVariants({ variant: "secondary" })}>
              <Icon name="chevron_left" size={18} />
              {tPager("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-small text-muted-foreground">
            {tPager("pageOf", { page, pages })}
          </span>
          {page < pages ? (
            <Link href={hrefOf[page + 1]!} className={buttonVariants({ variant: "secondary" })}>
              {tPager("next")}
              <Icon name="chevron_right" size={18} />
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
                {summary.buying.map((move) => (
                  // Finish order, Not bought, Reopen buying on every ticked order (07 Order
                  // progress; plan of 3.5): the server's buyingActions(), asked again on save.
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
                {summary.canRecordMoney ? (
                  // Finance's money on the ticked orders (08 Money ledger; plan of 4.3): the
                  // server's canRecordMoney, asked again on save.
                  <RecordMoneyButton
                    orderIds={summary.orders.map((order) => order.id)}
                    onAnswer={(answer) => {
                      setFailed(answer);
                      clear();
                    }}
                    size="sm"
                    className="max-sm:flex-1"
                  />
                ) : null}
                {summary.canSettle ? (
                  // Finance's settlement screen for the ticked orders (08 Closing 2; plan of
                  // 4.5): the server's canSettle, asked again by the screen and its actions.
                  <Link
                    href={`/orders/settle?ids=${summary.orders.map((order) => order.id).join(",")}`}
                    data-settle
                    className={cn(buttonVariants({ size: "sm" }), "max-sm:flex-1")}
                  >
                    {t("bar.settle")}
                  </Link>
                ) : null}
                {summary.canAcknowledgeOverspend ? (
                  // The Head's Acknowledge overspend with one comment (08 Overspend guard; plan of
                  // 4.7): the server's canAcknowledgeOverspend, asked again by the action.
                  <MoveButton
                    move="ACKNOWLEDGE_OVERSPEND"
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
                {summary.canMoveOwner ? (
                  // The Head moves the ticked orders to another Manager (03 rule 7; plan of
                  // 4.10): the server's canMoveOwner, asked again by the action.
                  <MoveOwnerButton
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
  yours,
}: {
  group: WireOrderGroup;
  open: boolean;
  onToggle: () => void;
  ticked: ReadonlySet<string>;
  /** Orders the last refused action named (06 rule 8; decided item 6). */
  refused: ReadonlySet<string>;
  onTick: (ids: readonly string[], on: boolean) => void;
  /** The row waits on this person: the orange mark. */
  yours: boolean;
}) {
  const t = useTranslations("orders.list");
  const tOrders = useTranslations("orders");
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
  const unit = group.unitShortName;
  const cell = "px-3 py-3 align-top max-sm:p-0";
  // A caption that names a value on a phone, where the header row is hidden.
  const caption = (column: "quantity" | "price" | "total") => (
    <span className="block text-xs text-muted-foreground sm:hidden">{t(`columns.${column}`)}</span>
  );
  const telling = (label: "number" | "price") =>
    group.colours !== null &&
    (group.colours[label].colour === "amber" || group.colours[label].colour === "red");
  const hasPrice = group.summary.priceHint !== null || telling("price");
  const flags = (
    <>
      {group.summary.urgent && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
          <Icon name="warning" size={16} />
          {t("urgent")}
        </span>
      )}
      {group.summary.overdue && (
        <span
          data-overdue
          className="inline-flex items-center gap-1 text-xs font-medium text-warning"
        >
          <Icon name="schedule" size={16} />
          {tOrders("overdue")}
        </span>
      )}
      {yours && (
        <span
          data-yours
          className="inline-flex items-center gap-1.5 rounded-full bg-today px-2 text-xs leading-5 font-medium text-foreground"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
          {t("yours")}
        </span>
      )}
    </>
  );

  return (
    <tbody
      data-group={group.key}
      data-ticked={tickedHere > 0 || undefined}
      className="border-t border-border first-of-type:border-t-0 data-ticked:bg-sidebar-primary/60 max-sm:mb-3 max-sm:block max-sm:rounded-xl max-sm:border max-sm:border-border max-sm:bg-card max-sm:p-3 max-sm:first-of-type:border-t"
    >
      {/* The whole row opens and closes its orders, as its toggle does; the tick box keeps its own
          click (design system, Panels and lists: a row with one destination; row-links.tsx). */}
      <tr
        data-row
        className="transition-colors duration-120 ease-out hover:bg-accent/60 max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-3 max-sm:hover:bg-transparent"
      >
        <td
          className={cn(
            cell,
            "relative w-12 pl-4 max-sm:col-start-1 max-sm:row-start-1 max-sm:w-auto max-sm:pl-0",
            yours &&
              "sm:before:absolute sm:before:inset-y-3 sm:before:left-0 sm:before:w-[3px] sm:before:rounded-r-full sm:before:bg-brand",
          )}
        >
          <label className="-m-2 flex size-11 cursor-pointer items-center justify-center sm:m-0 sm:size-6">
            <input
              ref={box}
              type="checkbox"
              checked={all}
              onChange={(event) => onTick(ids, event.target.checked)}
              aria-label={t("tickGroup", { product })}
              className="size-5 accent-primary sm:size-4"
            />
          </label>
        </td>
        <td
          className={cn(
            cell,
            "max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-1 max-sm:min-w-0 max-sm:pt-0.5",
          )}
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{product}</span>
            <span className="text-small text-muted-foreground">
              {t("rowFacts", {
                branch: group.branchCode,
                orders: t("orderCount", { count: group.summary.count }),
                date: format.date(group.summary.earliestNeededBy),
              })}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">
              <RequestStatusLabel status={group.status} />
              {flags}
            </span>
          </span>
        </td>
        <td className={cn(cell, "max-sm:hidden")}>
          <span className="flex flex-col items-start gap-1">
            <RequestStatusLabel status={group.status} />
            {flags}
          </span>
        </td>
        {/* Quantity, Price and Total each in its own column, with its own label (08 The three
            colours; redesign of 22.10.2026). */}
        <td
          data-cell="group-quantity"
          className={cn(
            cell,
            "text-right max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-2 max-sm:text-left",
          )}
        >
          {caption("quantity")}
          <span className="flex flex-col items-end gap-0.5 max-sm:items-start">
            <span className="whitespace-nowrap tabular-nums">
              {group.received === null
                ? `${format.quantity(group.summary.quantity)} ${unit}`
                : t("receivedOf", {
                    received: format.quantity(group.received),
                    planned: format.quantity(group.summary.quantity),
                    unit,
                  })}
            </span>
            {group.colours && <ListColourLabel colours={group.colours} of="number" />}
          </span>
        </td>
        <td
          data-cell="group-price"
          className={cn(
            cell,
            "text-right max-sm:col-span-4 max-sm:col-start-1 max-sm:row-start-3 max-sm:text-left",
            !hasPrice && "max-sm:hidden",
          )}
        >
          {hasPrice && caption("price")}
          <span className="flex flex-col items-end gap-0.5 max-sm:items-start">
            {group.summary.priceHint !== null && (
              <span className="text-xs text-warning">
                {tOrders("priceHint", {
                  percent: BigInt(group.summary.priceHint) as unknown as number,
                })}
              </span>
            )}
            {group.colours && <ListColourLabel colours={group.colours} of="price" />}
          </span>
        </td>
        <td
          className={cn(
            cell,
            "text-right max-sm:col-span-2 max-sm:col-start-3 max-sm:row-start-2 max-sm:text-left",
          )}
        >
          {caption("total")}
          <span className="flex flex-col items-end gap-0.5 max-sm:items-start">
            <span className="font-semibold whitespace-nowrap tabular-nums" data-cell="group-total">
              {format.money(BigInt(group.summary.totals.grand))}
            </span>
            {group.colours && <ListColourLabel colours={group.colours} of="total" />}
          </span>
        </td>
        <td
          className={cn(
            cell,
            "w-14 pr-4 text-right max-sm:col-start-4 max-sm:row-start-1 max-sm:w-auto max-sm:pr-0",
          )}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-controls={ordersId}
            onClick={onToggle}
            data-row-link
            // The name holds the visible product and branch code (WCAG 2.5.3; plan of 9.1d).
            aria-label={t(open ? "hideOrders" : "showOrders", {
              product: `${product} ${group.branchCode}`,
            })}
            title={t(open ? "hideOrders" : "showOrders", { product })}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground",
            )}
          >
            <Icon
              name="expand_more"
              className={cn("transition-transform duration-160", open && "rotate-180")}
            />
          </button>
        </td>
      </tr>
      {open && (
        <tr id={ordersId} className="max-sm:mt-3 max-sm:block">
          <td colSpan={7} className="px-4 pb-4 max-sm:block max-sm:p-0">
            <table className="w-full border-collapse overflow-hidden rounded-lg text-small max-sm:block sm:bg-muted">
              <caption className="sr-only">{t("ordersOf", { product })}</caption>
              <thead className="text-left text-xs text-muted-foreground max-sm:hidden">
                <tr>
                  <th scope="col" className="w-12 py-2 pr-2 pl-3 font-medium">
                    <span className="sr-only">{t("columns.tick")}</span>
                  </th>
                  {ORDER_COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className={cn(
                        "py-2 pr-3 font-medium",
                        RIGHT_COLUMNS.has(column) && "text-right",
                      )}
                    >
                      {t(`columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="max-sm:block">
                {group.orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    unit={unit}
                    ticked={ticked.has(order.id)}
                    refused={refused.has(order.id)}
                    onTick={onTick}
                  />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </tbody>
  );
}

/** The columns of an order row under its group (05 Group rows 2; redesign of 22.10.2026). */
const ORDER_COLUMNS = [
  "number",
  "department",
  "quantity",
  "stockAtSubmit",
  "stockNow",
  "price",
  "total",
  "paymentType",
  "neededBy",
  "owner",
  "submitted",
] as const;

const RIGHT_COLUMNS: ReadonlySet<string> = new Set(["quantity", "price", "total"]);

/**
 * One order under its group row. The whole row opens the order page, as its number does, the one
 * link; the tick box keeps its own click (design system, Panels and lists; row-links.tsx).
 * On a phone it is a flat block divided by a hairline, each value under its column's name.
 */
function OrderRow({
  order,
  unit,
  ticked,
  refused,
  onTick,
}: {
  order: WireListOrder;
  unit: string;
  ticked: boolean;
  refused: boolean;
  onTick: (ids: readonly string[], on: boolean) => void;
}) {
  const t = useTranslations("orders.list");
  const tOrders = useTranslations("orders");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  const td = "py-2 pr-3 align-top max-sm:p-0";
  // The column's name above a value on a phone, where the header row is hidden.
  const named = (column: (typeof ORDER_COLUMNS)[number]) => (
    <span className="block text-xs text-muted-foreground sm:hidden">{t(`columns.${column}`)}</span>
  );
  const plan = (amount: string) => (
    <span className="block text-xs text-muted-foreground">{t("plan", { amount })}</span>
  );
  return (
    <tr
      data-order={order.id}
      data-row
      data-refused={refused || undefined}
      className="border-t border-border transition-colors duration-120 ease-out hover:bg-accent data-refused:bg-destructive-bg max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:py-3 max-sm:hover:bg-transparent"
    >
      <td className="py-2 pr-2 pl-3 align-top max-sm:hidden">
        <label className="flex size-6 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(event) => onTick([order.id], event.target.checked)}
            aria-label={t("tickOrder", { number: order.number })}
            className="size-4 accent-primary"
          />
        </label>
      </td>
      <td
        className={cn(
          td,
          "font-medium max-sm:col-span-2 max-sm:flex max-sm:items-center max-sm:gap-2",
        )}
      >
        {/* On a phone the tick box stands on the number's line (redesign of 22.10.2026). */}
        <label className="-my-2 -ml-2 flex size-11 shrink-0 cursor-pointer items-center justify-center sm:hidden">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(event) => onTick([order.id], event.target.checked)}
            aria-label={t("tickOrder", { number: order.number })}
            className="size-5 accent-primary"
          />
        </label>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* The order page (plan of 2.9; progress 2.8, "For 2.9"). */}
          <Link
            href={`/orders/${order.id}`}
            data-row-link
            className="inline-flex min-h-11 items-center whitespace-nowrap underline decoration-border-strong underline-offset-4 hover:decoration-foreground sm:min-h-0"
          >
            {order.number}
          </Link>
          {order.revision > 1 && (
            <span className="font-normal text-muted-foreground">
              {tOrders("revision", { revision: order.revision })}
            </span>
          )}
          {order.priority === "URGENT" && <span className="text-destructive">{t("urgent")}</span>}
          {order.overdue && (
            <span data-overdue className="inline-flex items-center gap-1 text-warning">
              <Icon name="schedule" size={16} />
              {tOrders("overdue")}
            </span>
          )}
          {refused && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <Icon name="error" size={16} />
              {t("refusedMark")}
            </span>
          )}
        </span>
      </td>
      <td className={td}>
        {named("department")}
        {order.departmentName}
      </td>
      <td className={cn(td, "tabular-nums sm:text-right")}>
        {named("quantity")}
        <span className="flex flex-col gap-0.5 sm:items-end">
          <span className="whitespace-nowrap">
            {order.colours
              ? t("receivedOf", {
                  received: format.quantity(order.received),
                  planned: format.quantity(order.quantity),
                  unit,
                })
              : `${format.quantity(order.quantity)} ${unit}`}
          </span>
          {order.colours && <ListColourLabel colours={order.colours} of="number" />}
        </span>
      </td>
      {/* Stock at submit and now (06 rule 10; plan of 2.10, decided item 4). */}
      {(
        [
          ["stockAtSubmit", order.stockAtSubmit],
          ["stockNow", order.stockNow],
        ] as const
      ).map(([column, stock]) => (
        <td key={column} data-cell={column} className={cn(td, "tabular-nums sm:whitespace-nowrap")}>
          {named(column)}
          {stock === null ? t("noStock") : `${format.quantity(stock)} ${unit}`}
        </td>
      ))}
      <td className={cn(td, "tabular-nums sm:text-right")}>
        {named("price")}
        <span className="flex flex-col gap-0.5 sm:items-end">
          {order.actual ? (
            <>
              <span className="whitespace-nowrap">
                {order.actual.oneUnitPrice
                  ? format.money(BigInt(order.actual.unitPrice))
                  : t("average", { amount: format.money(BigInt(order.actual.unitPrice)) })}
              </span>
              {plan(format.money(BigInt(order.price)))}
            </>
          ) : (
            <span className="whitespace-nowrap">{format.money(BigInt(order.price))}</span>
          )}
          {order.priceHint !== null && (
            <span className="text-xs text-warning">
              {tOrders("priceHint", { percent: BigInt(order.priceHint) as unknown as number })}
            </span>
          )}
          {order.colours && <ListColourLabel colours={order.colours} of="price" />}
        </span>
      </td>
      <td className={cn(td, "tabular-nums sm:text-right")}>
        {named("total")}
        <span className="flex flex-col gap-0.5 sm:items-end">
          {order.actual ? (
            <>
              <span className="font-medium whitespace-nowrap">
                {format.money(BigInt(order.actual.total))}
              </span>
              {plan(format.money(BigInt(order.plannedTotal)))}
            </>
          ) : (
            <span className="font-medium whitespace-nowrap">
              {format.money(BigInt(order.plannedTotal))}
            </span>
          )}
          {order.colours && <ListColourLabel colours={order.colours} of="total" />}
        </span>
      </td>
      <td className={td}>
        {named("paymentType")}
        {tPayment(order.paymentType)}
      </td>
      <td className={cn(td, "tabular-nums")}>
        {named("neededBy")}
        {format.date(order.neededBy)}
      </td>
      <td className={td}>
        {named("owner")}
        {order.ownerName}
      </td>
      <td className={cn(td, "tabular-nums sm:whitespace-nowrap")}>
        {named("submitted")}
        {format.date(order.submittedAt)} {format.time(order.submittedAt)}
      </td>
    </tr>
  );
}
