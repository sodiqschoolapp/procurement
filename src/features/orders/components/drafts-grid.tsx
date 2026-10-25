"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getDraftAction,
  setDraftsNeededByAction,
  submitAgainOrdersAction,
  submitDraftsAction,
} from "@/app/(app)/orders/actions";
import { newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { DRAFTS_PAGE_SIZE } from "@/domain/drafts";
import type { WireCreated, WireDraftRow } from "@/features/orders/draft-wire";
import { parseTypedDate } from "@/i18n/format";

import { AddDraftRow } from "./add-draft-row";
import { DraftRow } from "./draft-row";
import { type GridBranch, GridProvider } from "./grid-context";
import { enterGoesTo, enterMoves } from "./grid-keys";
import {
  canApplyToTicked,
  canSubmitAgainTicked,
  canSubmitTicked,
  cellOfField,
  submitKeyFor,
  ticksMixDraftsAndSentBack,
} from "./grid-rules";
import type { RowSaveQueue } from "./row-save-queue";
import { TickedTotals } from "./ticked-totals";

// The drafts grid of /orders (11-screens-and-ux.md, Order list layout 3: "the Manager's draft
// orders and the orders sent back or taken back to them, edited like a spreadsheet"; plan of
// 2.5b). Rows come from the server page; a row with typing or a save in flight keeps its own
// state when the page is sent again (review of the plan, Must fix 3). Ticks belong to the page
// shown (decided item 5). The totals stand under the grid, as 05 says (Must fix 2), in a panel
// that floats at the bottom of the window and holds "Apply to ticked", Submit and "Clear" (11
// Order list layout 4; owner's report of 23.10.2026: above the table they were out of sight).
//
// Plan of 2.6: Enter moves to the same column of the next draft, Shift+Enter up, and the last
// draft's Enter goes to the add row (11 rule 2; grid-keys.ts). Below 640 px the table is a list
// of cards (decided items 4 and 5). While the add row retries a lost add, the page is not
// refreshed and no draft is deleted, so a draft the lost try made cannot be shown, deleted and
// made again by the retry (decided item 1, Look first).

export type GridRow = {
  row: WireDraftRow;
  editable: boolean;
  deletable: boolean;
  /** draftSubmittable() of src/domain/drafts.ts: the state machine offers Submit (plan of 2.7). */
  submittable: boolean;
  /** draftSubmittableAgain(): the state machine offers Submit again (plan of 2.11). */
  submittableAgain: boolean;
};

/** One failing order of the last Submit, for the short list on top (05 Checks at submit). */
type SubmitFailure = { id: string; name: string; problem: string };

export function DraftsGrid({
  rows: sent,
  page,
  total,
  branches,
  actorId,
  canAddToCatalog,
  defaultBranchId,
  canAdd,
  query,
}: {
  rows: readonly GridRow[];
  page: number;
  total: number;
  branches: readonly GridBranch[];
  actorId: string;
  /** The product search offers its Add line (04 rule 8; plan of 1.12b, decided item 10). */
  canAddToCatalog: boolean;
  defaultBranchId: string | null;
  canAdd: boolean;
  /** The address query of the page without the grid's own page, such as "owners=all". */
  query: string;
}) {
  const t = useTranslations("orders");
  const tAll = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<WireDraftRow[]>(() => sent.map((one) => one.row));
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [justAdded, setJustAdded] = useState<ReadonlySet<string>>(new Set());
  // The drafts opened to their fields on a phone; the others show their summary (redesign of
  // 22.10.2026). From 640 px every row shows every field, whatever this holds.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const openRow = useCallback((id: string, open: boolean) => {
    setOpened((current) => {
      if (current.has(id) === open) return current;
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const [dirtyRows, setDirtyRows] = useState<ReadonlySet<string>>(new Set());
  const [neededBy, setNeededBy] = useState("");
  const [neededByWrong, setNeededByWrong] = useState(false);
  const [applying, setApplying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // The Submit or Submit again the dialog asks about, with the ids it shows the count of and
  // sends: the count shown is the count sent (11 rule 6; plan of 2.7b, decided item 4).
  const [asking, setAsking] = useState<{ ids: readonly string[]; again: boolean } | null>(null);
  const [submitMarks, setSubmitMarks] = useState<ReadonlyMap<string, Record<string, string>>>(
    new Map(),
  );
  const [submitFailures, setSubmitFailures] = useState<readonly SubmitFailure[]>([]);
  // The client key of a Submit that got no answer, kept only while the same drafts are ticked
  // (review of the plan of 2.7, correction 4; developer-rules.md rule 8). Any answer drops it.
  const submitKey = useRef<{ key: string; ticked: string } | null>(null);
  // Any change to the ticks drops it too, not only a different set at the next Submit: A, then
  // A+B, then A again is a new Submit (correction 4; spec review of 2.7, Should fix 1). A refresh
  // that keeps the same ticks (a new Set, the same ids) keeps it.
  useEffect(() => {
    if (submitKey.current?.ticked !== submitKeyFor([...ticked])) submitKey.current = null;
  }, [ticked]);
  const failuresTop = useRef<HTMLDivElement>(null);
  const addingNow = useRef(false);
  const refreshWaits = useRef(false);
  const queues = useRef(new Map<string, RowSaveQueue>());
  const dirtyNow = useRef(dirtyRows);
  useEffect(() => {
    dirtyNow.current = dirtyRows;
  }, [dirtyRows]);

  /** router.refresh(), held while the add row retries (decided item 1). */
  const refresh = useCallback(() => {
    if (addingNow.current) refreshWaits.current = true;
    else router.refresh();
  }, [router]);

  const onAddBusy = useCallback(
    (busy: boolean) => {
      addingNow.current = busy;
      setAdding(busy);
      if (!busy && refreshWaits.current) {
        refreshWaits.current = false;
        router.refresh();
      }
    },
    [router],
  );

  /** 11 rule 2: Enter moves down a column; from the last draft to the add row. */
  function onGridKey(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const moves = enterMoves({
      tagName: target.tagName,
      type: (target as HTMLInputElement).type,
      expanded: target.getAttribute("aria-expanded"),
    });
    const cell = target.closest<HTMLElement>("td[data-col]");
    const row = target.closest<HTMLElement>("tr[data-draft]");
    if (!moves || !cell || !row) return;
    const shown = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("tr[data-draft]"));
    const to = enterGoesTo(shown.indexOf(row), shown.length, event.shiftKey);
    if (to === null) return;
    event.preventDefault();
    if (to === "add") {
      document.getElementById("add-product")?.focus();
      return;
    }
    const goal = shown[to]!;
    const focus = () =>
      goal
        .querySelector<HTMLElement>(
          `td[data-col="${cell.dataset.col}"] input:not([type=hidden]):not([tabindex="-1"]), td[data-col="${cell.dataset.col}"] select`,
        )
        ?.focus();
    // A folded phone card opens first, so its cell can take the focus.
    if (goal.dataset.open === "false" && goal.dataset.draft) {
      openRow(goal.dataset.draft, true);
      requestAnimationFrame(focus);
    } else {
      focus();
    }
  }

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
    if (to > 1) params.set("draftsPage", String(to));
    const text = params.toString();
    return `/orders${text ? `?${text}` : ""}`;
  }

  function onAdded(created: WireCreated) {
    if (created.merged) {
      // The merged row takes the server's row, dirty or not, so its quantity, total and version
      // are the server's (spec review of 2.5b, Must fix 1).
      void getDraftAction({ id: created.id }).then((answer) => {
        if (answer.ok && answer.data) onRow(answer.data);
      });
    } else {
      setJustAdded((current) => new Set([...current, created.id]));
      // A new draft opens on a phone; Done folds it like any other (review of d14a85a).
      openRow(created.id, true);
      // A new draft sorts last (oldest first): go to the page it lands on (Should fix 2).
      const last = Math.ceil((total + 1) / DRAFTS_PAGE_SIZE);
      if (last !== page) {
        // The grid stays where it is on the page (no jump to the top).
        router.push(pageHref(last), { scroll: false });
        return;
      }
    }
    refresh();
  }

  /** 05 field 8: one needed-by date on every ticked draft, all or nothing (06 rule 8). */
  async function apply() {
    const date = parseTypedDate(neededBy);
    setNeededByWrong(date === null);
    if (!date || applying || ticked.size === 0) return;
    setApplying(true);
    const ids = rows.filter((row) => ticked.has(row.id)).map((row) => row.id);
    const held = ids.map((id) => queues.current.get(id)!);
    // Every held queue is released, also when the call throws (spec review, Must fix 2).
    const released = new Set<number>();
    const release = (at: number, version?: number) => {
      if (released.has(at)) return;
      released.add(at);
      held[at]!.release(version);
    };
    try {
      const versions = await Promise.all(held.map((queue) => queue.hold()));
      const result = await setDraftsNeededByAction({
        orders: ids.map((id, at) => ({ id, version: versions[at]! })),
        neededBy: date,
      });
      if (result.ok) {
        const versionOf = new Map(result.data.orders.map((order) => [order.id, order.version]));
        ids.forEach((id, at) => release(at, versionOf.get(id)));
        toast.success(t("ticked.applied", { count: ids.length }));
        setNeededBy("");
      } else {
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
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      held.forEach((_, at) => release(at));
      setApplying(false);
      refresh();
    }
  }

  /** The name of a row in messages: its number, else its product and department. */
  function nameOf(row: WireDraftRow | undefined): string {
    if (!row) return "";
    if (row.number) return row.number;
    return [row.productName ?? t("draftWord"), row.departmentName].filter(Boolean).join(", ");
  }

  /**
   * 05 Drafts 4: the ticked drafts go to the Head, all or nothing (Checks at submit; 06 rule 8);
   * 05 Drafts 5: ticked sent-back orders are submitted again the same way (plan of 2.11, decided
   * item 9). Pending saves land first, so the versions sent are the rows' own. A refusal marks the
   * exact cells of the exact orders, lists them on top and moves to the first one. Never retried
   * automatically (progress 2.6, "For 2.7"). It runs only from the confirmation (11 rule 6; plan
   * of 2.7b), with the ids the dialog was opened for.
   */
  async function submit(ids: readonly string[], again: boolean) {
    if (submitting || ids.length === 0) return;
    setSubmitting(true);
    const held = ids.map((id) => queues.current.get(id)!);
    const released = new Set<number>();
    const release = (at: number, version?: number) => {
      if (released.has(at)) return;
      released.add(at);
      held[at]!.release(version);
    };
    const tickedNow = submitKeyFor(ids);
    if (submitKey.current?.ticked !== tickedNow) {
      submitKey.current = { key: newClientKey(), ticked: tickedNow };
    }
    const clientKey = submitKey.current.key;
    let answered = false;
    try {
      const versions = await Promise.all(held.map((queue) => queue.hold()));
      const input = { clientKey, orders: ids.map((id, at) => ({ id, version: versions[at]! })) };
      const submitted = again ? null : await submitDraftsAction(input);
      const result = submitted ?? (await submitAgainOrdersAction(input));
      answered = true;
      setAsking(null);
      if (result.ok) {
        if (submitted?.ok) {
          const numbers = submitted.data.orders.flatMap((order) =>
            order.number ? [order.number] : [],
          );
          toast.success(
            t("submit.done", {
              count: numbers.length,
              numbers: numbers.slice(0, 10).join(", "),
              more: Math.max(0, numbers.length - 10),
            }),
          );
        } else {
          toast.success(t("moves.done.SUBMIT_AGAIN", { count: result.data.orders.length }));
        }
        setSubmitMarks(new Map());
        setSubmitFailures([]);
        setTicked(new Set());
        for (const id of ids) onGone(id);
        return;
      }
      const failed = result.error.orders ?? [];
      if (failed.length === 0) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      const byId = new Map(rows.map((row) => [row.id, row]));
      const marks = new Map<string, Record<string, string>>();
      const listed: SubmitFailure[] = [];
      for (const order of failed) {
        const texts: Record<string, string> = {};
        for (const [field, key] of Object.entries(order.fields ?? {})) {
          // An extra-cost row is marked on the extras cell, which shows its rows.
          texts[field.startsWith("extras.") ? "extras" : field] = tAll(key);
        }
        marks.set(order.orderId, texts);
        const first = Object.entries(order.fields ?? {})[0];
        listed.push({
          id: order.orderId,
          name: nameOf(byId.get(order.orderId)),
          problem: first
            ? `${t(`columns.${cellOfField(first[0])}`)}: ${tAll(first[1])}`
            : t(`submit.refused.${order.code}`),
        });
      }
      setSubmitMarks(marks);
      setSubmitFailures(listed);
      // The screen moves to the first failing cell (05 Checks at submit), after the marks render.
      const firstOrder = failed[0]!;
      const firstField = Object.keys(firstOrder.fields ?? {})[0];
      requestAnimationFrame(() => {
        const rowElement = document.querySelector<HTMLElement>(
          `tr[data-draft="${firstOrder.orderId}"]`,
        );
        const cell = firstField
          ? rowElement?.querySelector<HTMLElement>(`td[data-col="${cellOfField(firstField)}"]`)
          : null;
        const target = cell ?? rowElement ?? failuresTop.current;
        target?.scrollIntoView({ block: "center" });
        (
          cell?.querySelector<HTMLElement>("input:not([type=hidden]), select, button") ??
          failuresTop.current
        )?.focus();
      });
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      // Any answer drops the key; a call that got none keeps it for the same ticks (correction 4).
      if (answered) submitKey.current = null;
      held.forEach((_, at) => release(at));
      setSubmitting(false);
      setAsking(null);
      refresh();
    }
  }

  const tickedRows = rows.filter((row) => ticked.has(row.id));
  const canSubmit = canSubmitTicked(
    tickedRows.map((row) => row.id),
    rights,
  );
  const canSubmitAgain = canSubmitAgainTicked(
    tickedRows.map((row) => row.id),
    rights,
  );
  const mixed = ticksMixDraftsAndSentBack(
    tickedRows.map((row) => row.id),
    rights,
  );
  const canApply = canApplyToTicked(
    tickedRows.map((row) => row.id),
    rights,
  );
  /** The cells marked on a row: a deactivated entry, then the last Submit's refusals. */
  function marksOf(row: WireDraftRow): Record<string, string> | undefined {
    const fromSubmit = submitMarks.get(row.id);
    if (row.inactive.length === 0 && !fromSubmit) return undefined;
    const marks: Record<string, string> = {};
    for (const field of row.inactive) {
      marks[field.startsWith("extras.") ? "extras" : field] = tAll("errors.field.inactive");
    }
    return { ...marks, ...fromSubmit };
  }

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
    <GridProvider branches={branches} actorId={actorId} canAddToCatalog={canAddToCatalog}>
      <UnsavedChangesGuard dirty={dirtyRows.size > 0 || adding} />
      <div className="flex flex-col gap-4">
        {submitFailures.length > 0 && (
          <div
            ref={failuresTop}
            role="alert"
            tabIndex={-1}
            className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive-bg px-4 py-3 text-sm outline-none"
          >
            <span className="font-semibold text-destructive">
              {t("submit.failedTitle", { count: submitFailures.length })}
            </span>
            <ul className="flex flex-col gap-1">
              {submitFailures.map((failure) => (
                <li key={failure.id}>
                  {t("submit.failedLine", { name: failure.name, problem: failure.problem })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <div className="relative overflow-x-auto rounded-xl border border-border bg-card max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent">
            <table className="w-max min-w-full border-collapse text-sm max-sm:block max-sm:w-full">
              <caption className="sr-only">{t("draftsTitle")}</caption>
              <thead className="border-b border-border bg-muted text-left text-xs text-muted-foreground max-sm:hidden">
                <tr>
                  <th scope="col" className="sticky left-0 z-[1] bg-muted px-2 py-2.5 font-medium">
                    <span className="sr-only">{t("columns.tick")}</span>
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className={cn(
                        "px-2 py-2.5 font-medium whitespace-nowrap",
                        column === "number" &&
                          "sticky left-8 z-[1] border-r border-border bg-muted",
                      )}
                    >
                      {t(`columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody onKeyDown={onGridKey} className="max-sm:flex max-sm:flex-col max-sm:gap-3">
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
                      open={opened.has(row.id)}
                      onOpen={(open) => openRow(row.id, open)}
                      onTick={(on) => tick(row.id, on)}
                      onRow={onRow}
                      onGone={onGone}
                      onDirty={onDirty}
                      registerQueue={registerQueue}
                      deleteHeld={adding}
                      marks={marksOf(row)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canAdd && (
          <AddDraftRow
            defaultBranchId={defaultBranchId}
            onAdded={onAdded}
            onBusy={onAddBusy}
            onStartOver={refresh}
          />
        )}

        <ConfirmDialog
          open={asking !== null}
          onOpenChange={(open) => !open && setAsking(null)}
          pending={submitting}
          text={
            asking?.again
              ? {
                  title: t("moves.title.SUBMIT_AGAIN", { count: asking.ids.length }),
                  result: t("moves.result.SUBMIT_AGAIN", { count: asking.ids.length }),
                  confirm: t("moves.button.SUBMIT_AGAIN"),
                }
              : {
                  title: t("submit.confirmTitle", { count: asking?.ids.length ?? 0 }),
                  result: t("submit.confirmResult", { count: asking?.ids.length ?? 0 }),
                  confirm: t("submit.confirm"),
                }
          }
          onConfirm={() => asking && void submit(asking.ids, asking.again)}
        />

        <TickedTotals
          drafts={tickedRows.map((row) => ({
            quantity: row.quantity,
            price: row.price,
            extras: row.extras.map((extra) => extra.amount),
            paymentType: row.paymentType,
          }))}
          actions={
            <>
              {(canSubmit || canSubmitAgain) && (
                <Button
                  type="button"
                  size="sm"
                  pending={submitting}
                  onClick={() =>
                    setAsking({ ids: tickedRows.map((row) => row.id), again: canSubmitAgain })
                  }
                >
                  {t(canSubmitAgain ? "submit.againButton" : "submit.button", {
                    count: ticked.size,
                  })}
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
                {t("ticked.clear")}
              </Button>
              {mixed && (
                <p
                  data-ticked-mixed
                  className="flex basis-full items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <Icon name="info" size={16} />
                  <span>{t("submit.mixed")}</span>
                </p>
              )}
            </>
          }
          tools={
            canApply && (
              <div className="flex flex-col gap-2">
                <label htmlFor="ticked-needed-by" className="text-muted-foreground">
                  {t("ticked.neededBy")}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="ticked-needed-by"
                    value={neededBy}
                    placeholder={t("date.placeholder")}
                    aria-invalid={neededByWrong || undefined}
                    aria-describedby={neededByWrong ? "ticked-needed-by-error" : undefined}
                    onChange={(event) => setNeededBy(event.target.value)}
                    className="w-36"
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
                </div>
                {neededByWrong && (
                  <p id="ticked-needed-by-error" className="text-destructive">
                    {t("date.invalid")}
                  </p>
                )}
              </div>
            )
          }
        />
      </div>
    </GridProvider>
  );
}
