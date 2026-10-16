"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { setDraftsNeededByAction } from "@/app/(app)/orders/actions";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { DRAFTS_PAGE_SIZE } from "@/domain/drafts";
import type { WireCreated, WireDraftRow } from "@/features/orders/draft-wire";
import { parseTypedDate } from "@/i18n/format";

import { AddDraftRow } from "./add-draft-row";
import { DraftRow } from "./draft-row";
import { type GridBranch, GridProvider } from "./grid-context";
import type { RowSaveQueue } from "./row-save-queue";
import { TickedTotals } from "./ticked-totals";

// The drafts grid of /orders (11-screens-and-ux.md, Order list layout 3: "the Manager's draft
// orders and the orders sent back or taken back to them, edited like a spreadsheet"; plan of
// 2.5b). Rows come from the server page; a row with typing or a save in flight keeps its own
// state when the page is sent again (review of the plan, Must fix 3). Ticks belong to the page
// shown (decided item 5). The selection bar above the table holds the count, "Apply to ticked"
// and "Clear"; the totals stand under the grid, as 05 says (Must fix 2).

export type GridRow = { row: WireDraftRow; editable: boolean; deletable: boolean };

export function DraftsGrid({
  rows: sent,
  page,
  total,
  branches,
  actorId,
  defaultBranchId,
  canAdd,
  query,
}: {
  rows: readonly GridRow[];
  page: number;
  total: number;
  branches: readonly GridBranch[];
  actorId: string;
  defaultBranchId: string | null;
  canAdd: boolean;
  /** The address query of the view without its page, such as "owners=all". */
  query: string;
}) {
  const t = useTranslations("orders");
  const tAll = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<WireDraftRow[]>(() => sent.map((one) => one.row));
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [justAdded, setJustAdded] = useState<ReadonlySet<string>>(new Set());
  const [dirtyRows, setDirtyRows] = useState<ReadonlySet<string>>(new Set());
  const [neededBy, setNeededBy] = useState("");
  const [neededByWrong, setNeededByWrong] = useState(false);
  const [applying, setApplying] = useState(false);
  const queues = useRef(new Map<string, RowSaveQueue>());
  const dirtyNow = useRef(dirtyRows);
  useEffect(() => {
    dirtyNow.current = dirtyRows;
  }, [dirtyRows]);

  const rights = useMemo(() => new Map(sent.map((one) => [one.row.id, one])), [sent]);

  // A page sent again replaces each row that has no typing and no save in flight.
  useEffect(() => {
    setRows((shown) =>
      sent.map(({ row }) => {
        const busy = queues.current.get(row.id)?.state().busy ?? false;
        if (!busy && !dirtyNow.current.has(row.id)) return row;
        return shown.find((one) => one.id === row.id) ?? row;
      }),
    );
    const onPage = new Set(sent.map((one) => one.row.id));
    setTicked((current) => new Set([...current].filter((id) => onPage.has(id))));
  }, [sent]);

  const onRow = useCallback((row: WireDraftRow) => {
    setRows((shown) => shown.map((one) => (one.id === row.id ? row : one)));
  }, []);
  const onGone = useCallback((id: string) => {
    setRows((shown) => shown.filter((one) => one.id !== id));
    setTicked((current) => new Set([...current].filter((one) => one !== id)));
  }, []);
  const onDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyRows((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const registerQueue = useCallback((id: string, queue: RowSaveQueue | null) => {
    if (queue) queues.current.set(id, queue);
    else queues.current.delete(id);
  }, []);

  function tick(id: string, on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function pageHref(to: number): string {
    const params = new URLSearchParams(query);
    if (to > 1) params.set("page", String(to));
    const text = params.toString();
    return `/orders${text ? `?${text}` : ""}`;
  }

  function onAdded(created: WireCreated) {
    if (!created.merged) {
      setJustAdded((current) => new Set([...current, created.id]));
      // A new draft sorts last (oldest first): go to the page it lands on (Should fix 2).
      const last = Math.ceil((total + 1) / DRAFTS_PAGE_SIZE);
      if (last !== page) {
        router.push(pageHref(last));
        return;
      }
    }
    router.refresh();
  }

  /** 05 field 8: one needed-by date on every ticked draft, all or nothing (06 rule 8). */
  async function apply() {
    const date = parseTypedDate(neededBy);
    setNeededByWrong(date === null);
    if (!date || applying || ticked.size === 0) return;
    setApplying(true);
    const ids = rows.filter((row) => ticked.has(row.id)).map((row) => row.id);
    const held = ids.map((id) => queues.current.get(id)!);
    try {
      const versions = await Promise.all(held.map((queue) => queue.hold()));
      const result = await setDraftsNeededByAction({
        orders: ids.map((id, at) => ({ id, version: versions[at]! })),
        neededBy: date,
      });
      if (result.ok) {
        const versionOf = new Map(result.data.orders.map((order) => [order.id, order.version]));
        ids.forEach((id, at) => held[at]!.release(versionOf.get(id)));
        toast.success(t("ticked.applied", { count: ids.length }));
        setNeededBy("");
      } else {
        held.forEach((queue) => queue.release());
        const failed = new Set((result.error.orders ?? []).map((order) => order.orderId));
        const names = rows
          .filter((row) => failed.has(row.id))
          .map((row) => row.productName ?? row.number ?? "")
          .join(", ");
        toast.error(
          failed.size > 0
            ? `${t("ticked.failed", { count: failed.size })} ${names}`
            : tAll(result.error.messageKey),
        );
      }
    } finally {
      setApplying(false);
      router.refresh();
    }
  }

  const tickedRows = rows.filter((row) => ticked.has(row.id));
  const columns = [
    "number",
    "branch",
    "product",
    "type",
    "subtype",
    "inStock",
    "photo",
    "company",
    "requestedBy",
    "neededBy",
    "measure",
    "quantity",
    "price",
    "extras",
    "paymentType",
    "priority",
    "comment",
    "total",
    "state",
    "actions",
  ] as const;

  return (
    <GridProvider branches={branches} actorId={actorId}>
      <UnsavedChangesGuard dirty={dirtyRows.size > 0} />
      <div className="flex flex-col gap-4">
        {ticked.size > 0 && (
          <div
            role="region"
            aria-label={t("ticked.count", { count: ticked.size })}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-today px-4 py-3"
          >
            <span className="text-sm font-semibold">
              {t("ticked.count", { count: ticked.size })}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <label htmlFor="ticked-needed-by" className="sr-only">
                {t("ticked.neededBy")}
              </label>
              <Input
                id="ticked-needed-by"
                value={neededBy}
                placeholder={t("date.placeholder")}
                aria-invalid={neededByWrong || undefined}
                aria-describedby={neededByWrong ? "ticked-needed-by-error" : undefined}
                onChange={(event) => setNeededBy(event.target.value)}
                className="w-36 sm:h-8"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                pending={applying}
                onClick={() => void apply()}
              >
                {t("ticked.apply")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
                {t("ticked.clear")}
              </Button>
            </span>
            {neededByWrong && (
              <span id="ticked-needed-by-error" className="w-full text-sm text-destructive">
                {t("date.invalid")}
              </span>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl bg-card">
            <table className="w-max min-w-full border-collapse text-sm">
              <caption className="sr-only">{t("draftsTitle")}</caption>
              <thead className="bg-muted text-left text-[13px] leading-[18px] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2 py-2 font-semibold">
                    <span className="sr-only">{t("columns.tick")}</span>
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-2 py-2 font-semibold whitespace-nowrap"
                    >
                      {t(`columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const right = rights.get(row.id);
                  return (
                    <DraftRow
                      key={row.id}
                      row={row}
                      editable={right?.editable ?? false}
                      deletable={right?.deletable ?? false}
                      ticked={ticked.has(row.id)}
                      justAdded={justAdded.has(row.id)}
                      onTick={(on) => tick(row.id, on)}
                      onRow={onRow}
                      onGone={onGone}
                      onDirty={onDirty}
                      registerQueue={registerQueue}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canAdd && <AddDraftRow defaultBranchId={defaultBranchId} onAdded={onAdded} />}

        <TickedTotals
          drafts={tickedRows.map((row) => ({
            quantity: row.quantity,
            price: row.price,
            extras: row.extras.map((extra) => extra.amount),
            paymentType: row.paymentType,
          }))}
        />
      </div>
    </GridProvider>
  );
}
