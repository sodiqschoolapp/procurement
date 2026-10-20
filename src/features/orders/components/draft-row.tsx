"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { deleteDraftAction, getDraftAction, updateDraftAction } from "@/app/(app)/orders/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DraftGridLabel } from "@/components/status-label";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import type { WireDraftRow } from "@/features/orders/draft-wire";
import { parseTypedDate } from "@/i18n/format";
import { useFormatters } from "@/i18n/use-formatters";
import type { ActionResult } from "@/server/action-result";

import { ExtrasCell } from "./extras-editor";
import { useGrid } from "./grid-context";
import { rowHoldsSent } from "./grid-rules";
import { ProductPicker, Thumb } from "./product-picker";
import { ReferencePhoto } from "./reference-photo";
import { type SaveState, SaveStateText } from "./save-state";
import { type RowSaveQueue, createRowSaveQueue } from "./row-save-queue";
import { TextCell } from "./text-cell";

// One row of the drafts grid (05-order-request-form.md, Order fields 1 to 18; Drafts 3 and 5;
// 11-screens-and-ux.md, Order list layout 3 and rules 4, 6; plan of 2.5b). Every write is
// updateDraft with the row's version through the row's save queue; after a save the row is
// read again from the server (getDraft), so price, company, measure, photo, stock, total and
// hint are always the server's (review of the plan, Must fix 3). A row the person may not edit
// (decide() on the server page) shows text only.
//
// Plan of 2.6: below 640 px the same row is a card (decided items 4 and 5): each cell carries its
// column's name above it, for the eye only (the control keeps its own label). Each cell has
// `data-col`, so Enter moves to the same column of the next row (grid-keys.ts). A save that gets
// no answer is sent again by the row's queue (decided items 7 and 11): "No connection. Trying
// again…", then "Not saved" with "Try again" when the tries are used up (review of the plan,
// correction 2); what was typed stays in the cell.

export type DraftRowProps = {
  row: WireDraftRow;
  editable: boolean;
  deletable: boolean;
  ticked: boolean;
  justAdded: boolean;
  onTick(ticked: boolean): void;
  onRow(row: WireDraftRow): void;
  onGone(id: string): void;
  onDirty(id: string, dirty: boolean): void;
  registerQueue(id: string, queue: RowSaveQueue | null): void;
  /** True while the add row retries an add: deletes wait (plan of 2.6, decided item 1). */
  deleteHeld?: boolean;
  /**
   * The texts the grid marks on this row's cells, by field name: a deactivated entry (edge case
   * "A product is deactivated while it sits in a draft") and the refusals of the last Submit
   * (05 Checks at submit; plan of 2.7). A save's own field error is shown first.
   */
  marks?: Readonly<Record<string, string>>;
};

const CELL = "px-2 py-2 align-top max-sm:block max-sm:min-w-0 max-sm:px-0 max-sm:py-1.5";

/** One cell: its column for Enter, its name above it on a phone card, half or full card width. */
function Cell({
  col,
  label,
  half = false,
  className,
  children,
  ...rest
}: {
  col: string;
  label?: string;
  half?: boolean;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentProps<"td">, "children" | "className">) {
  return (
    <td
      data-col={col}
      className={cn(CELL, half ? "max-sm:w-1/2 max-sm:pr-2" : "max-sm:w-full", className)}
      {...rest}
    >
      {label && (
        <span
          aria-hidden="true"
          data-card-label
          className="mb-1 block text-[13px] leading-4 font-semibold text-muted-foreground sm:hidden"
        >
          {label}
        </span>
      )}
      {children}
    </td>
  );
}

export function DraftRow(props: DraftRowProps) {
  const { row, editable, deletable } = props;
  const t = useTranslations("orders");
  const tAll = useTranslations();
  const tCatalog = useTranslations("catalog");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  const router = useRouter();
  const grid = useGrid();

  const [state, setState] = useState<SaveState>(
    props.justAdded ? { kind: "saved" } : { kind: "idle" },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);
  const [pendingUrgent, setPendingUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState<Record<string, boolean>>({});

  const lastLost = useRef<Record<string, unknown> | null>(null);
  const latest = useRef(row);
  const callbacks = useRef(props);
  useEffect(() => {
    latest.current = row;
    callbacks.current = props;
  });

  const [queue] = useState(() => createRowSaveQueue(row.version));

  const reload = useCallback(async () => {
    const answer = await getDraftAction({ id: latest.current.id });
    if (!answer.ok) return;
    if (answer.data === null) {
      callbacks.current.onGone(latest.current.id);
      return;
    }
    queue.adopt(answer.data.version);
    callbacks.current.onRow(answer.data);
  }, [queue]);

  useEffect(() => {
    queue.listen({
      onChange: (now) => setBusy(now.busy),
      onStale: () => {
        setState({ kind: "error", text: t("save.stale") });
        void reload();
      },
      onRetrying: (retrying) => {
        if (retrying) setState({ kind: "retrying" });
      },
    });
  }, [queue, reload, t]);

  useEffect(() => {
    const register = callbacks.current.registerQueue;
    register(row.id, queue);
    return () => register(row.id, null);
  }, [row.id, queue]);

  // A row the server sent again (a revalidated page) gives its version to an idle queue.
  useEffect(() => {
    queue.adopt(row.version);
  }, [row.version, queue]);

  const anyTyped = Object.values(typed).some(Boolean);
  const dirty =
    anyTyped ||
    busy ||
    pendingBranch !== null ||
    pendingUrgent ||
    state.kind === "error" ||
    state.kind === "notSaved";
  useEffect(() => {
    const report = callbacks.current.onDirty;
    report(row.id, dirty);
    return () => report(row.id, false);
  }, [dirty, row.id]);

  // One stable callback per cell: a new one on every render would run the cell's effect again on
  // every render and loop ("Maximum update depth exceeded", found in the build of 2.6).
  const [typedSetters] = useState(() => new Map<string, (isTyped: boolean) => void>());
  const typedOf = useCallback(
    (name: string) => {
      let setter = typedSetters.get(name);
      if (!setter) {
        setter = (isTyped: boolean) =>
          setTyped((current) =>
            current[name] === isTyped ? current : { ...current, [name]: isTyped },
          );
        typedSetters.set(name, setter);
      }
      return setter;
    },
    [typedSetters],
  );

  /** Saves the given fields; resolves to the field errors of a refusal, or null when saved. */
  async function save(fields: Record<string, unknown>): Promise<Record<string, string> | null> {
    setState({ kind: "saving" });
    let refused: Record<string, string> | null = null;
    const answer = await queue.save(
      async (version) => {
        let result: ActionResult<unknown>;
        try {
          result = await updateDraftAction({ id: latest.current.id, version, ...fields });
        } catch {
          // No answer came: the queue sends the same save again (11 rule 7; decided item 11).
          return { kind: "lost" };
        }
        if (result.ok) {
          return { kind: "saved", version: (result.data as { version: number }).version };
        }
        if (result.error.code === "stale_version") return { kind: "stale" };
        const texts: Record<string, string> = {};
        for (const [path, key] of Object.entries(result.error.fields ?? {})) {
          texts[path] = tAll(key);
        }
        refused = texts;
        setErrors(texts);
        setState({ kind: "error", text: tAll(result.error.messageKey) });
        return { kind: "refused" };
      },
      // A retry answered stale: saved only when the server row holds what was sent (review of
      // the plan, correction 1) and its version is the one this write made (permission review,
      // Must fix 1: a later write by someone else is never skipped).
      async (sentVersion) => {
        const now = await getDraftAction({ id: latest.current.id });
        if (!now.ok || !now.data || now.data.version !== sentVersion + 1) return null;
        return rowHoldsSent(now.data, fields) ? now.data.version : null;
      },
    );
    if (answer !== "dropped" && answer.kind === "saved") {
      lastLost.current = null;
      setErrors({});
      setState({ kind: "saved" });
      await reload();
      return null;
    }
    if (answer !== "dropped" && answer.kind === "lost") {
      lastLost.current = fields;
      setState({ kind: "notSaved" });
    }
    return refused ?? {};
  }

  /** "Try again" after "Not saved": the same fields once more (correction 2). */
  function tryAgain() {
    const fields = lastLost.current;
    if (fields) void save(fields);
  }

  /** For a typed cell: true when saved, so a failed text may be sent again. */
  const saved = (fields: Record<string, unknown>) =>
    save(fields).then((refused) => refused === null);

  function loadChoices() {
    if (editable) void grid.loadChoices(pendingBranch ?? row.branchId);
  }

  const branchId = pendingBranch ?? row.branchId;
  const choices = grid.choices[branchId];
  const product = row.productName ?? "";
  const productText = row.subtypeName ? `${product} — ${row.subtypeName}` : product;
  const creatable = grid.branches.filter((branch) => branch.canCreate && branch.isActive);
  const branchName = (id: string) => grid.branches.find((branch) => branch.id === id)?.code ?? "";
  const neverSubmitted = row.status === "DRAFT" && row.number === null;
  const showUrgentReason = row.priority === "URGENT" || pendingUrgent;

  async function remove() {
    setDeleting(true);
    let result: Awaited<ReturnType<typeof deleteDraftAction>> | null = null;
    try {
      const version = await queue.hold();
      result = await deleteDraftAction({ id: row.id, version });
    } catch {
      result = null;
    } finally {
      // Released also when the call throws (spec review, Must fix 2).
      queue.release();
      setDeleting(false);
      setAsking(false);
    }
    if (!result?.ok) {
      toast.error(tAll(result ? result.error.messageKey : "errors.network"));
      void reload();
      return;
    }
    toast.success(t("delete.done"));
    callbacks.current.onDirty(row.id, false);
    callbacks.current.onGone(row.id);
    router.refresh();
  }

  const fieldError = (name: string) => errors[name] ?? props.marks?.[name];
  const errorText = (name: string) =>
    fieldError(name) && (
      <span className="mt-1 block text-[13px] leading-4 text-destructive">{fieldError(name)}</span>
    );
  const ro = (text: string | null) => (
    <span className="block min-h-10 py-2.5 text-sm leading-5">{text ?? t("none")}</span>
  );

  return (
    <tr
      className={cn(
        "border-t border-border",
        // A phone card (decided items 4 and 5; docs/design-system.md: a white panel, corner 12,
        // no shadow and no side stripe; a ticked card is --muted, as a ticked row).
        "max-sm:flex max-sm:flex-wrap max-sm:items-start max-sm:rounded-xl max-sm:border-t-0 max-sm:bg-card max-sm:p-4",
        props.ticked && "bg-muted max-sm:bg-muted",
      )}
      onFocusCapture={loadChoices}
      data-draft={row.id}
    >
      <Cell col="tick" className="max-sm:w-auto max-sm:pr-2">
        {/* The tick's touch target is 44 px on a phone (11 rule 13). */}
        <label
          data-tick
          className="flex cursor-pointer items-start max-sm:size-11 max-sm:items-center max-sm:justify-center"
        >
          <input
            type="checkbox"
            checked={props.ticked}
            onChange={(event) => props.onTick(event.target.checked)}
            aria-label={t("tickRow", { product: productText })}
            className="mt-3 size-4 accent-foreground max-sm:mt-0 max-sm:size-5"
          />
        </label>
      </Cell>
      <Cell col="number" className="min-w-36 max-sm:w-auto max-sm:flex-1">
        <span className="flex flex-col gap-1 py-2">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {/* A numbered row opens its order page, where its Cancel is (plan of 2.3b, decided
                item 11). */}
            {row.number ? (
              <Link
                href={`/orders/${row.id}`}
                className="inline-flex min-h-11 items-center underline-offset-2 hover:underline sm:min-h-0"
                data-order-link
              >
                {row.number}
              </Link>
            ) : (
              t("draftWord")
            )}
            {row.revision >= 2 && (
              <span className="font-normal text-muted-foreground">
                {t("revision", { revision: row.revision })}
              </span>
            )}
          </span>
          {row.label && <DraftGridLabel label={row.label} />}
          <span className="text-[13px] leading-4 text-muted-foreground">
            {t("ownerAndDate", {
              owner: row.ownerName,
              date: format.date(new Date(row.createdAt)),
            })}
          </span>
        </span>
      </Cell>
      <Cell col="branch" label={t("columns.branch")}>
        {editable && neverSubmitted && creatable.length > 1 ? (
          <Select
            aria-label={t("columns.branch")}
            value={branchId}
            aria-invalid={fieldError("branchId") ? true : undefined}
            onChange={(event) => {
              const next = event.target.value;
              setPendingBranch(next === row.branchId ? null : next);
              if (next !== row.branchId) void grid.loadChoices(next);
            }}
          >
            {creatable.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code}
              </option>
            ))}
            {!creatable.some((branch) => branch.id === row.branchId) && (
              <option value={row.branchId}>{branchName(row.branchId)}</option>
            )}
          </Select>
        ) : (
          ro(branchName(row.branchId))
        )}
        {errorText("branchId")}
        {pendingBranch && (
          <span className="mt-1 block text-[13px] leading-4 text-warning">
            {t("save.branchPending")}
          </span>
        )}
      </Cell>
      <Cell col="product" label={t("columns.product")}>
        <span className="flex items-start gap-2">
          <Thumb fileId={row.photoFileId} alt={t("photo.alt", { name: productText })} />
          {editable ? (
            <span className="flex flex-col gap-1">
              <ProductPicker
                branchId={branchId}
                shown={productText}
                label={t("columns.product")}
                invalid={Boolean(fieldError("variantId"))}
                onPick={(picked) => void save({ variantId: picked.subtype.id })}
              />
              {fieldError("variantId") && (
                <span className="text-[13px] leading-4 text-destructive">
                  {fieldError("variantId")}
                </span>
              )}
            </span>
          ) : (
            ro(productText)
          )}
        </span>
      </Cell>
      <Cell col="type" label={t("columns.type")} half>
        {ro(row.productType ? tCatalog(`productType.${row.productType}`) : null)}
      </Cell>
      <Cell col="subtype" label={t("columns.subtype")} half>
        {ro(row.subtypeName)}
      </Cell>
      <Cell
        col="inStock"
        label={t("columns.inStock")}
        half
        className="text-right tabular-nums max-sm:text-left"
      >
        {ro(row.inStock === null ? null : format.quantity(row.inStock))}
      </Cell>
      <Cell col="photo" label={t("columns.photo")}>
        <ReferencePhoto
          fileId={row.referencePhotoFileId}
          product={productText}
          editable={editable}
          onSave={(fileId) => save({ referencePhotoFileId: fileId })}
        />
      </Cell>
      <Cell col="company" label={t("columns.company")}>
        {editable ? (
          <Select
            aria-label={t("columns.company")}
            value={row.companyId ?? ""}
            aria-invalid={fieldError("companyId") ? true : undefined}
            onChange={(event) => void save({ companyId: event.target.value || null })}
            className="min-w-40"
          >
            <option value="">{t("noCompany")}</option>
            {(choices?.companies ?? []).map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
            {row.companyId &&
              !choices?.companies.some((company) => company.id === row.companyId) && (
                <option value={row.companyId}>{row.companyName}</option>
              )}
          </Select>
        ) : (
          ro(row.companyName)
        )}
        {errorText("companyId")}
      </Cell>
      <Cell col="requestedBy" label={t("columns.requestedBy")} className="min-w-48">
        {editable ? (
          <span className="flex flex-col gap-1">
            <Select
              aria-label={t("columns.requestedBy")}
              value={pendingBranch ? "" : (row.departmentId ?? "")}
              aria-invalid={fieldError("departmentId") ? true : undefined}
              onChange={(event) => {
                const departmentId = event.target.value;
                if (!departmentId) return;
                const fields = pendingBranch
                  ? { branchId: pendingBranch, departmentId }
                  : { departmentId };
                void save(fields).then((refused) => {
                  if (refused === null) setPendingBranch(null);
                });
              }}
            >
              {(pendingBranch || !row.departmentId) && (
                <option value="">{t("pickDepartment")}</option>
              )}
              {(choices?.departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
              {!pendingBranch &&
                row.departmentId &&
                !choices?.departments.some((department) => department.id === row.departmentId) && (
                  <option value={row.departmentId}>{row.departmentName}</option>
                )}
            </Select>
            {fieldError("departmentId") && (
              <span className="text-[13px] leading-4 text-destructive">
                {fieldError("departmentId")}
              </span>
            )}
            {!pendingBranch && row.responsibleName && (
              <span className="text-[13px] leading-4 text-muted-foreground">
                {t("responsible", { name: row.responsibleName })}
              </span>
            )}
            <TextCell
              value={row.requesterName ?? ""}
              label={t("columns.requesterName")}
              placeholder={t("columns.requesterName")}
              error={fieldError("requesterName")}
              onDirty={typedOf("requesterName")}
              onCommit={(text) => saved({ requesterName: text })}
            />
          </span>
        ) : (
          <span className="flex flex-col">
            {ro(row.departmentName)}
            {row.requesterName && (
              <span className="text-[13px] text-muted-foreground">{row.requesterName}</span>
            )}
          </span>
        )}
      </Cell>
      <Cell col="neededBy" label={t("columns.neededBy")} className="min-w-32">
        {editable ? (
          <NeededByCell
            value={row.neededBy ? format.date(row.neededBy) : ""}
            serverError={fieldError("neededBy")}
            onDirty={typedOf("neededBy")}
            onSave={(neededBy) => saved({ neededBy })}
          />
        ) : (
          ro(row.neededBy ? format.date(row.neededBy) : null)
        )}
      </Cell>
      <Cell col="measure" label={t("columns.measure")} half>
        {ro(row.unitShortName)}
      </Cell>
      <Cell col="quantity" label={t("columns.quantity")} half className="min-w-24">
        {editable ? (
          <TextCell
            value={row.quantity ?? ""}
            label={t("columns.quantity")}
            inputMode="decimal"
            className="text-right tabular-nums"
            error={fieldError("quantity")}
            onDirty={typedOf("quantity")}
            onCommit={(text) => saved({ quantity: text })}
          />
        ) : (
          ro(row.quantity === null ? null : format.quantity(row.quantity))
        )}
      </Cell>
      <Cell col="price" label={t("columns.price")} half className="min-w-28">
        {editable ? (
          <TextCell
            value={row.price ?? ""}
            label={t("columns.price")}
            inputMode="numeric"
            className="text-right tabular-nums"
            error={fieldError("price")}
            onDirty={typedOf("price")}
            onCommit={(text) => saved({ price: text })}
          />
        ) : (
          ro(row.price === null ? null : format.money(BigInt(row.price)))
        )}
      </Cell>
      <Cell col="extras" label={t("columns.extras")} half className="text-right max-sm:text-left">
        <span className="flex min-h-10 items-center justify-end">
          <ExtrasCell
            product={productText}
            extras={row.extras}
            choices={choices}
            editable={editable}
            onOpen={loadChoices}
            onSave={(extras) => save({ extras })}
          />
        </span>
        {fieldError("extras") && (
          <span className="text-[13px] leading-4 text-destructive">{fieldError("extras")}</span>
        )}
      </Cell>
      <Cell col="paymentType" label={t("columns.paymentType")}>
        {editable ? (
          <Select
            aria-label={t("columns.paymentType")}
            value={row.paymentType}
            onChange={(event) => void save({ paymentType: event.target.value })}
            className="min-w-40"
          >
            {PAYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tPayment(type)}
              </option>
            ))}
          </Select>
        ) : (
          ro(tPayment(row.paymentType))
        )}
      </Cell>
      <Cell col="priority" label={t("columns.priority")} className="min-w-36">
        {editable ? (
          <span className="flex flex-col gap-1">
            <Select
              aria-label={t("columns.priority")}
              value={showUrgentReason ? "URGENT" : "NORMAL"}
              onChange={(event) => {
                if (event.target.value === "URGENT") {
                  setPendingUrgent(true);
                } else {
                  setPendingUrgent(false);
                  if (row.priority === "URGENT") void save({ priority: "NORMAL" });
                }
              }}
            >
              <option value="NORMAL">{t("priority.NORMAL")}</option>
              <option value="URGENT">{t("priority.URGENT")}</option>
            </Select>
            {showUrgentReason && (
              <TextCell
                value={row.urgentReason ?? ""}
                label={t("columns.urgentReason")}
                placeholder={t("columns.urgentReason")}
                error={fieldError("urgentReason")}
                onDirty={typedOf("urgentReason")}
                onCommit={(text) =>
                  saved({ priority: "URGENT", urgentReason: text }).then((ok) => {
                    if (ok) setPendingUrgent(false);
                    return ok;
                  })
                }
              />
            )}
            {pendingUrgent && row.priority !== "URGENT" && (
              <span className="text-[13px] leading-4 text-warning">{t("save.urgentPending")}</span>
            )}
          </span>
        ) : (
          <span className="flex flex-col">
            {ro(t(`priority.${row.priority}`))}
            {row.urgentReason && (
              <span className="text-[13px] text-muted-foreground">{row.urgentReason}</span>
            )}
          </span>
        )}
      </Cell>
      <Cell col="comment" label={t("columns.comment")} className="min-w-48">
        {editable ? (
          <TextCell
            value={row.comment ?? ""}
            label={t("columns.comment")}
            error={fieldError("comment")}
            onDirty={typedOf("comment")}
            onCommit={(text) => saved({ comment: text })}
          />
        ) : (
          ro(row.comment)
        )}
      </Cell>
      <Cell col="total" label={t("columns.total")} half className="text-right max-sm:text-left">
        <span className="flex min-h-10 flex-col items-end justify-center gap-1 py-1">
          <span className="text-sm font-semibold whitespace-nowrap tabular-nums" data-cell="total">
            {row.total === null ? t("none") : format.money(BigInt(row.total))}
          </span>
          {row.priceHint !== null && (
            <span
              className="text-[13px] leading-4 whitespace-nowrap text-warning"
              data-cell="price-hint"
            >
              {t("priceHint", { percent: BigInt(row.priceHint) as unknown as number })}
            </span>
          )}
        </span>
      </Cell>
      <Cell col="state" half className="min-w-28" aria-live="polite">
        <SaveStateText state={state} onTryAgain={tryAgain} />
      </Cell>
      <Cell col="actions" half className="max-sm:text-right">
        {deletable && (
          <>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              icon="delete"
              aria-label={t("delete.label", { product: productText })}
              disabled={props.deleteHeld}
              onClick={() => setAsking(true)}
            />
            <ConfirmDialog
              open={asking}
              onOpenChange={setAsking}
              pending={deleting}
              onConfirm={() => void remove()}
              text={{
                title: t("delete.title"),
                result: t("delete.result", { product: productText }),
                confirm: t("delete.confirm"),
                danger: true,
              }}
            />
          </>
        )}
      </Cell>
    </tr>
  );
}

/** The needed-by cell (05 field 8): typed as 08.10.2026 (11 rule 10), saved as YYYY-MM-DD. */
function NeededByCell({
  value,
  serverError,
  onDirty,
  onSave,
}: {
  value: string;
  serverError?: string;
  onDirty(dirty: boolean): void;
  onSave(neededBy: string | null): Promise<boolean>;
}) {
  const t = useTranslations("orders");
  const [wrong, setWrong] = useState(false);
  const [typing, setTyping] = useState(false);
  const report = useCallback(
    (dirty: boolean) => {
      setTyping(dirty);
      onDirty(dirty);
    },
    [onDirty],
  );
  return (
    <TextCell
      value={value}
      label={t("columns.neededBy")}
      placeholder={t("date.placeholder")}
      error={wrong && typing ? t("date.invalid") : serverError}
      onDirty={report}
      onCommit={(text) => {
        if (text.trim() === "") {
          setWrong(false);
          return onSave(null);
        }
        const date = parseTypedDate(text);
        setWrong(date === null);
        return date ? onSave(date) : Promise.resolve(false);
      }}
    />
  );
}
