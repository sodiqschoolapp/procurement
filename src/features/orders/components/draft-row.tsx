"use client";

import { useTranslations } from "next-intl";
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
import { ProductPicker, Thumb } from "./product-picker";
import { ReferencePhoto } from "./reference-photo";
import { type RowSaveQueue, createRowSaveQueue } from "./row-save-queue";
import { TextCell } from "./text-cell";

// One row of the drafts grid (05-order-request-form.md, Order fields 1 to 18; Drafts 3 and 5;
// 11-screens-and-ux.md, Order list layout 3 and rules 4, 6; plan of 2.5b). Every write is
// updateDraft with the row's version through the row's save queue; after a save the row is
// read again from the server (getDraft), so price, company, measure, photo, stock, total and
// hint are always the server's (review of the plan, Must fix 3). A row the person may not edit
// (decide() on the server page) shows text only.

type SaveState =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; text: string };

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
};

const CELL = "px-2 py-2 align-top";

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
    anyTyped || busy || pendingBranch !== null || pendingUrgent || state.kind === "error";
  useEffect(() => {
    const report = callbacks.current.onDirty;
    report(row.id, dirty);
    return () => report(row.id, false);
  }, [dirty, row.id]);

  const typedOf = useCallback(
    (name: string) => (isTyped: boolean) =>
      setTyped((current) =>
        current[name] === isTyped ? current : { ...current, [name]: isTyped },
      ),
    [],
  );

  /** Saves the given fields; resolves to the field errors of a refusal, or null when saved. */
  async function save(fields: Record<string, unknown>): Promise<Record<string, string> | null> {
    setState({ kind: "saving" });
    let refused: Record<string, string> | null = null;
    const answer = await queue.save(async (version) => {
      let result: ActionResult<unknown>;
      try {
        result = await updateDraftAction({ id: latest.current.id, version, ...fields });
      } catch {
        refused = {};
        setState({ kind: "error", text: tAll("errors.network") });
        return { kind: "refused" };
      }
      if (result.ok) {
        return { kind: "saved", version: (result.data as { version: number }).version };
      }
      if (result.error.code === "stale_version") return { kind: "stale" };
      const texts: Record<string, string> = {};
      for (const [path, key] of Object.entries(result.error.fields ?? {})) texts[path] = tAll(key);
      refused = texts;
      setErrors(texts);
      setState({ kind: "error", text: tAll(result.error.messageKey) });
      return { kind: "refused" };
    });
    if (answer !== "dropped" && answer.kind === "saved") {
      setErrors({});
      setState({ kind: "saved" });
      await reload();
      return null;
    }
    return refused ?? {};
  }

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
    const version = await queue.hold();
    const result = await deleteDraftAction({ id: row.id, version });
    queue.release();
    setDeleting(false);
    setAsking(false);
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      void reload();
      return;
    }
    toast.success(t("delete.done"));
    callbacks.current.onDirty(row.id, false);
    callbacks.current.onGone(row.id);
    router.refresh();
  }

  const fieldError = (name: string) => errors[name];
  const ro = (text: string | null) => (
    <span className="block min-h-10 py-2.5 text-sm leading-5">{text ?? t("none")}</span>
  );

  return (
    <tr
      className={cn("border-t border-border", props.ticked && "bg-today")}
      onFocusCapture={loadChoices}
      data-draft={row.id}
    >
      <td className={CELL}>
        <input
          type="checkbox"
          checked={props.ticked}
          onChange={(event) => props.onTick(event.target.checked)}
          aria-label={t("tickRow", { product: productText })}
          className="mt-3 size-4 accent-foreground"
        />
      </td>
      <td className={cn(CELL, "min-w-36")}>
        <span className="flex flex-col gap-1 py-2">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {row.number ?? t("draftWord")}
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
      </td>
      <td className={CELL}>
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
        {pendingBranch && (
          <span className="mt-1 block text-[13px] leading-4 text-warning">
            {t("save.branchPending")}
          </span>
        )}
      </td>
      <td className={CELL}>
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
      </td>
      <td className={CELL}>
        {ro(row.productType ? tCatalog(`productType.${row.productType}`) : null)}
      </td>
      <td className={CELL}>{ro(row.subtypeName)}</td>
      <td className={cn(CELL, "text-right tabular-nums")}>
        {ro(row.inStock === null ? null : format.quantity(row.inStock))}
      </td>
      <td className={CELL}>
        <ReferencePhoto
          fileId={row.referencePhotoFileId}
          product={productText}
          editable={editable}
          onSave={(fileId) => save({ referencePhotoFileId: fileId })}
        />
      </td>
      <td className={CELL}>
        {editable ? (
          <Select
            aria-label={t("columns.company")}
            value={row.companyId ?? ""}
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
      </td>
      <td className={cn(CELL, "min-w-48")}>
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
              onCommit={(text) => void save({ requesterName: text })}
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
      </td>
      <td className={cn(CELL, "min-w-32")}>
        {editable ? (
          <NeededByCell
            value={row.neededBy ? format.date(row.neededBy) : ""}
            serverError={fieldError("neededBy")}
            onDirty={typedOf("neededBy")}
            onSave={(neededBy) => save({ neededBy })}
          />
        ) : (
          ro(row.neededBy ? format.date(row.neededBy) : null)
        )}
      </td>
      <td className={CELL}>{ro(row.unitShortName)}</td>
      <td className={cn(CELL, "min-w-24")}>
        {editable ? (
          <TextCell
            value={row.quantity ?? ""}
            label={t("columns.quantity")}
            inputMode="decimal"
            className="text-right tabular-nums"
            error={fieldError("quantity")}
            onDirty={typedOf("quantity")}
            onCommit={(text) => void save({ quantity: text })}
          />
        ) : (
          ro(row.quantity === null ? null : format.quantity(row.quantity))
        )}
      </td>
      <td className={cn(CELL, "min-w-28")}>
        {editable ? (
          <TextCell
            value={row.price ?? ""}
            label={t("columns.price")}
            inputMode="numeric"
            className="text-right tabular-nums"
            error={fieldError("price")}
            onDirty={typedOf("price")}
            onCommit={(text) => void save({ price: text })}
          />
        ) : (
          ro(row.price === null ? null : format.money(BigInt(row.price)))
        )}
      </td>
      <td className={cn(CELL, "text-right")}>
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
      </td>
      <td className={CELL}>
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
      </td>
      <td className={cn(CELL, "min-w-36")}>
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
                  void save({ priority: "URGENT", urgentReason: text }).then((refused) => {
                    if (refused === null) setPendingUrgent(false);
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
      </td>
      <td className={cn(CELL, "min-w-48")}>
        {editable ? (
          <TextCell
            value={row.comment ?? ""}
            label={t("columns.comment")}
            error={fieldError("comment")}
            onDirty={typedOf("comment")}
            onCommit={(text) => void save({ comment: text })}
          />
        ) : (
          ro(row.comment)
        )}
      </td>
      <td className={cn(CELL, "text-right")}>
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
      </td>
      <td className={cn(CELL, "min-w-28")} aria-live="polite">
        <span
          className={cn(
            "block py-2.5 text-[13px] leading-5",
            state.kind === "saved" && "text-success",
            state.kind === "error" && "text-destructive",
            state.kind === "saving" && "text-muted-foreground",
          )}
        >
          {state.kind === "saving" && t("save.saving")}
          {state.kind === "saved" && t("save.saved")}
          {state.kind === "error" && state.text}
        </span>
      </td>
      <td className={CELL}>
        {deletable && (
          <>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              icon="delete"
              aria-label={t("delete.label", { product: productText })}
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
      </td>
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
  onSave(neededBy: string | null): Promise<unknown>;
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
          void onSave(null);
          return;
        }
        const date = parseTypedDate(text);
        setWrong(date === null);
        if (date) void onSave(date);
      }}
    />
  );
}
