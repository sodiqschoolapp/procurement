"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { type ComponentProps, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import {
  enterStockDirectlyAction,
  searchDirectEntryItemsAction,
} from "@/app/(app)/warehouse/documents/new/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { Button, buttonVariants } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field, useFieldControl } from "@/components/ui/field";
import { FIELD_CLASSES, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { quantityRefusal } from "@/domain/drafts";
import { parseSomOrZero } from "@/domain/money";
import {
  DIRECT_ENTRY_REASONS,
  type DirectEntryReason,
  DOCUMENT_LINES_MAX,
  directEntryCommentRefusal,
} from "@/domain/stock-documents";
import type {
  DirectEntryBranch,
  DirectEntryItem,
} from "@/features/warehouse/queries/direct-entry-form";
import { useFormatters } from "@/i18n/use-formatters";

import { DOCUMENT_STEPS, firstDocumentStepWithError } from "./document-steps";

// The direct-entry form (09-warehouse.md, Direct entry by the Head: branch, date, reason, lines
// with product, subtype, quantity and cost per unit, comment; plan of 5.8, Screens). The return
// form's shape (./return-form.tsx) without a department: the branch prefilled when the Head's
// branch view names one; a line added from the search, its cost prefilled with the subtype's
// reference price (decided item 1, Look first: without one the cost starts empty and must be
// typed); the reason "Other" makes the comment required (directEntryCommentRefusal() of the
// domain, which the server asks again). Changing the branch with lines typed asks first, and the
// lines leave the form. At phone width (below `sm`) one step at a time, hidden by CSS only, so
// every field is sent. After a save the number, "New direct entry" and "Stock on hand" take the
// form's place. No confirmation: a direct entry is reversible (decided item 9).

type Line = {
  variantId: string;
  qty: string;
  unitCost: string;
  /** What the line shows: the product and subtype, the stock, the measure, the reference price. */
  productName: string;
  subtypeName: string | null;
  inStock: string;
  unitShortName: string;
  allowsDecimals: boolean;
  hasReferencePrice: boolean;
};

type Values = {
  branchId: string;
  docDate: string;
  reason: DirectEntryReason;
  comment: string;
  lines: Line[];
};

type Saved = { documentId: string; number: string };

const SEARCH_PAUSE_MS = 250;

const noSubscription = () => () => undefined;

export function DirectEntryForm({
  branches,
  initialBranchId,
  today,
}: {
  branches: readonly DirectEntryBranch[];
  /** The branch prefilled: the only one, or the branch view's; empty when the Head must choose. */
  initialBranchId: string;
  /** Today in Tashkent, `YYYY-MM-DD`: the default date and the latest allowed. */
  today: string;
}) {
  const t = useTranslations("warehouse.directEntry");
  const tWhy = useTranslations("common.whyNot");
  const tAll = useTranslations();
  const format = useFormatters();
  const action = useAction(enterStockDirectlyAction, { create: true });
  const [saved, setSaved] = useState<Saved | null>(null);
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [moves, setMoves] = useState(0);
  const formElement = useRef<HTMLFormElement>(null);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const empty = (branchId: string): Values => ({
    branchId,
    docDate: today,
    reason: "EXISTING_STOCK",
    comment: "",
    lines: [],
  });
  const { register, handleSubmit, control, setValue, reset, formState } = useForm<Values>({
    defaultValues: empty(initialBranchId),
  });
  // The date field shows dd.mm.yyyy and gives YYYY-MM-DD (DateInput); the form keeps the rule.
  register("docDate", { required: true });
  const docDate = useWatch({ control, name: "docDate" });
  const lines = useFieldArray({ control, name: "lines" });
  const values = useWatch({ control }) as Values;
  const fieldTexts = action.fieldTexts;

  useEffect(() => {
    if (moves === 0) return;
    const heading = formElement.current?.querySelector<HTMLElement>(
      `[data-step="${step}"] [data-step-heading]`,
    );
    formElement.current?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [moves, step]);

  function goTo(next: number) {
    setStep(next);
    setMoves((count) => count + 1);
  }

  /** The form's branch changes: the stock shown was the old branch's, so the lines leave. */
  function switchBranch(branchId: string) {
    reset({ ...empty(branchId), docDate: values.docDate, reason: values.reason });
    action.forget();
  }

  function addLine(item: DirectEntryItem, subtype: DirectEntryItem["subtypes"][number]) {
    const at = values.lines.findIndex((line) => line.variantId === subtype.id);
    if (at >= 0) {
      document.getElementById(`entry-qty-${at}`)?.focus();
      return;
    }
    lines.append({
      variantId: subtype.id,
      qty: "",
      unitCost: subtype.referencePrice ?? "",
      productName: item.name,
      subtypeName: subtype.name,
      inStock: subtype.inStock,
      unitShortName: item.unitShortName,
      allowsDecimals: item.allowsDecimals,
      hasReferencePrice: subtype.referencePrice !== null,
    });
  }

  const commentMissing =
    directEntryCommentRefusal(
      values.reason,
      values.comment.trim() === "" ? null : values.comment,
    ) !== null;

  function qtyError(index: number): string | undefined {
    const line = values.lines[index];
    if (!line) return undefined;
    if (line.qty.trim() !== "") {
      const refusal = quantityRefusal(line.qty, line.allowsDecimals);
      if (refusal) return tAll(`errors.field.${refusal}`);
    }
    return fieldTexts[`lines.${index}.qty`];
  }

  function costError(index: number): string | undefined {
    const line = values.lines[index];
    if (!line) return undefined;
    if (line.unitCost.trim() !== "" && parseSomOrZero(line.unitCost) === null) {
      return tAll("errors.field.wrongFormat");
    }
    return fieldTexts[`lines.${index}.unitCost`];
  }

  const onSubmit = handleSubmit(async (typed) => {
    const result = await action.run({
      branchId: typed.branchId,
      docDate: typed.docDate,
      reason: typed.reason,
      comment: typed.comment.trim() === "" ? null : typed.comment,
      lines: typed.lines.map((line) => ({
        variantId: line.variantId,
        qty: line.qty,
        unitCost: line.unitCost,
      })),
    });
    if (!result) return;
    if (result.ok) {
      setSaved(result.data);
      reset(typed);
      toast.success(t("saved", { number: result.data.number }));
      return;
    }
    const keys = Object.keys(result.error.fields ?? {});
    const next = firstDocumentStepWithError(keys, step);
    if (next !== step) goTo(next);
    if (keys.length === 0) toast.error(tAll(result.error.messageKey));
  });

  if (saved) {
    return (
      <section
        data-entry-saved
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <h2 className="flex items-center gap-2 text-subheading font-semibold">
          <Icon name="check_circle" className="text-success" />
          {t("savedTitle", { number: saved.number })}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            className="max-sm:h-12"
            icon="add"
            onClick={() => {
              setSaved(null);
              action.forget();
              reset(empty(values.branchId));
              setStep(0);
            }}
          >
            {t("newEntry")}
          </Button>
          <Link
            href="/warehouse/stock"
            className={cn(buttonVariants({ variant: "ghost" }), "max-sm:h-12")}
          >
            {t("toStock")}
          </Link>
        </div>
      </section>
    );
  }

  const branchChosen = values.branchId !== "";
  const stepClass = (at: number) =>
    cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6", {
      "max-sm:hidden": at !== step,
    });

  return (
    <form ref={formElement} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={formState.isDirty && !saved} />
      <ConfirmDialog
        open={pendingBranch !== null}
        onOpenChange={(open) => !open && setPendingBranch(null)}
        text={{
          title: t("switchTitle"),
          result: t("switchResult"),
          confirm: t("switchConfirm"),
          danger: true,
        }}
        onConfirm={() => {
          const next = pendingBranch!;
          setPendingBranch(null);
          switchBranch(next);
        }}
      />

      <section data-step={0} aria-labelledby="entry-step-0" className={stepClass(0)}>
        <h2
          id="entry-step-0"
          data-step-heading
          tabIndex={-1}
          className="text-subheading font-semibold outline-none"
        >
          {t("whatAndWhy")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {branches.length > 1 ? (
            <Field id="entry-branch" label={t("branch")} error={fieldTexts.branchId}>
              <Select
                value={values.branchId}
                onChange={(event) => {
                  const next = event.target.value;
                  if (values.lines.length > 0) setPendingBranch(next);
                  else switchBranch(next);
                }}
              >
                <option value="">{t("chooseBranch")}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {tAll("branch.option", { code: branch.code, name: branch.name })}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="flex flex-col gap-1.5 text-sm">
              <span className="text-sm leading-5 font-semibold">{t("branch")}</span>
              {branches[0]
                ? tAll("branch.option", { code: branches[0].code, name: branches[0].name })
                : null}
            </p>
          )}
          <Field id="entry-date" label={t("date")} error={fieldTexts.docDate}>
            <DateInput
              max={today}
              value={docDate}
              onValueChange={(next) =>
                setValue("docDate", next, {
                  shouldDirty: true,
                  shouldValidate: formState.isSubmitted,
                })
              }
            />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span id="entry-reason-label" className="text-sm leading-5 font-semibold">
            {t("reason")}
          </span>
          <Segmented
            label={t("reason")}
            value={values.reason}
            onValueChange={(reason) => setValue("reason", reason, { shouldDirty: true })}
            options={DIRECT_ENTRY_REASONS.map((reason) => ({
              value: reason,
              label: t(`reasons.${reason}`),
            }))}
            className="w-full sm:w-auto sm:self-start"
          />
          {fieldTexts.reason ? (
            <span className="text-sm leading-5 text-destructive">{fieldTexts.reason}</span>
          ) : null}
        </div>
      </section>

      <section data-step={1} aria-labelledby="entry-step-1" className={stepClass(1)}>
        <h2
          id="entry-step-1"
          data-step-heading
          tabIndex={-1}
          className="text-subheading font-semibold outline-none"
        >
          {t("items")}
        </h2>
        {branchChosen ? (
          <ItemSearch
            branchId={values.branchId}
            full={values.lines.length >= DOCUMENT_LINES_MAX}
            onPick={addLine}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("branchFirst")}</p>
        )}
        {fieldTexts.lines ? (
          <p role="alert" className="text-sm text-destructive">
            {fieldTexts.lines}
          </p>
        ) : null}
        {lines.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noLines")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.fields.map((field, index) => {
              const line = values.lines[index] ?? field;
              const name = line.subtypeName
                ? `${line.productName} · ${line.subtypeName}`
                : line.productName;
              return (
                <li
                  key={field.id}
                  data-entry-line={line.variantId}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-start"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold">{name}</span>
                    <span data-in-stock className="text-sm leading-5 text-muted-foreground">
                      {t("inStock", {
                        qty: format.quantity(line.inStock),
                        unit: line.unitShortName,
                      })}
                    </span>
                    {line.hasReferencePrice ? null : (
                      <span className="text-sm leading-5 text-muted-foreground">
                        {t("noReferencePrice")}
                      </span>
                    )}
                    {fieldTexts[`lines.${index}.variantId`] ? (
                      <span className="text-sm leading-5 text-destructive">
                        {fieldTexts[`lines.${index}.variantId`]}
                      </span>
                    ) : null}
                  </div>
                  <Field
                    id={`entry-qty-${index}`}
                    label={t("quantity", { unit: line.unitShortName })}
                    error={qtyError(index)}
                    className="sm:w-36"
                  >
                    <Input
                      inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                      autoComplete="off"
                      {...register(`lines.${index}.qty`)}
                      className="max-sm:h-12"
                    />
                  </Field>
                  <Field
                    id={`entry-cost-${index}`}
                    label={t("unitCost")}
                    error={costError(index)}
                    className="sm:w-44"
                  >
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      {...register(`lines.${index}.unitCost`)}
                      className="max-sm:h-12"
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    icon="delete"
                    className="self-end max-sm:h-12 sm:mt-6"
                    aria-label={t("removeLine", { name })}
                    onClick={() => lines.remove(index)}
                  >
                    <span className="sm:sr-only">{t("remove")}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-step={2} aria-labelledby="entry-step-2" className={stepClass(2)}>
        <h2
          id="entry-step-2"
          data-step-heading
          tabIndex={-1}
          className="text-subheading font-semibold outline-none"
        >
          {t("commentStep")}
        </h2>
        <Field
          id="entry-comment"
          label={values.reason === "OTHER" ? t("comment") : t("commentOptional")}
          error={fieldTexts.comment}
        >
          <CommentBox required={values.reason === "OTHER"} {...register("comment")} />
        </Field>
        {commentMissing && !fieldTexts.comment ? (
          <p data-comment-needed className="text-sm leading-5 text-muted-foreground">
            {t("commentNeeded")}
          </p>
        ) : null}
      </section>

      {action.errorText && Object.keys(fieldTexts).length === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {action.errorText}
        </p>
      ) : null}

      <nav
        aria-label={t("steps")}
        data-step-bar
        className="flex items-center justify-between gap-3 sm:hidden"
      >
        {step > 0 ? (
          <Button variant="secondary" size="lg" icon="chevron_left" onClick={() => goTo(step - 1)}>
            {t("previous")}
          </Button>
        ) : (
          <span />
        )}
        <span data-step-count className="text-sm tabular-nums">
          {t("step", { current: step + 1, total: DOCUMENT_STEPS })}
        </span>
        {step < DOCUMENT_STEPS - 1 ? (
          <Button size="lg" onClick={() => goTo(step + 1)}>
            {t("next")}
          </Button>
        ) : (
          <span />
        )}
      </nav>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {/* A greyed-out Save says why (redesign of 21.10.2026). */}
        {hydrated && lines.fields.length === 0 && (
          <p className="flex items-center gap-1.5 text-small text-muted-foreground sm:mr-auto">
            <Icon name="info" size={16} className="shrink-0" />
            {tWhy("noItems")}
          </p>
        )}
        <Link
          href="/warehouse/stock"
          className={cn(buttonVariants({ variant: "ghost" }), "max-sm:h-12")}
        >
          {t("cancel")}
        </Link>
        <Button
          type="submit"
          pending={action.pending}
          disabled={!hydrated || lines.fields.length === 0}
          className={cn("h-12 sm:h-10", step !== DOCUMENT_STEPS - 1 && "max-sm:hidden")}
        >
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/** The comment, tied to its label and error line by the field (aria-required over a line). */
function CommentBox({ required, ...props }: { required: boolean } & ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      {...useFieldControl()}
      rows={3}
      maxLength={1000}
      aria-required={required}
      className={cn(FIELD_CLASSES, "min-h-24 py-2")}
    />
  );
}

/**
 * The search of the catalog for a direct entry: up to 20 products by name with their subtypes,
 * the branch's stock and the reference price of each. The "nothing found" line shows only once
 * the answer for the text typed now has come (.claude/rules/ui.md).
 */
function ItemSearch({
  branchId,
  full,
  onPick,
}: {
  branchId: string;
  full: boolean;
  onPick: (item: DirectEntryItem, subtype: DirectEntryItem["subtypes"][number]) => void;
}) {
  const t = useTranslations("warehouse.directEntry");
  const tAll = useTranslations();
  const format = useFormatters();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{
    q: string;
    branchId: string;
    items: DirectEntryItem[];
  } | null>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      const found = await searchDirectEntryItemsAction({ branchId, q });
      if (!current) return;
      if (found.ok) setAnswer({ q, branchId, items: found.data });
      else toast.error(tAll(found.error.messageKey));
    }, SEARCH_PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [branchId, q, tAll]);

  // An answer of another branch is never shown: its stock is not this one's.
  const shown = answer !== null && answer.branchId === branchId ? answer : null;
  const answered = shown !== null && shown.q === q;
  return (
    <div className="flex flex-col gap-2">
      <Field id="entry-search" label={t("search")}>
        <Input
          type="search"
          value={q}
          disabled={full}
          placeholder={t("searchHint")}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setQ(event.target.value)}
          className="max-sm:h-12"
        />
      </Field>
      {full ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {t("full", { max: DOCUMENT_LINES_MAX })}
        </p>
      ) : answered && shown.items.length === 0 ? (
        <p data-nothing-found className="text-sm leading-5 text-muted-foreground">
          {t("nothingFound")}
        </p>
      ) : shown ? (
        <ul aria-label={t("results")} className="flex max-h-72 flex-col overflow-y-auto">
          {shown.items.flatMap((item) =>
            item.subtypes.map((subtype) => (
              <li key={subtype.id}>
                <button
                  type="button"
                  data-pick={subtype.id}
                  onClick={() => onPick(item, subtype)}
                  className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0">
                    {subtype.name ? `${item.name} · ${subtype.name}` : item.name}
                  </span>
                  <span className="flex shrink-0 flex-wrap gap-x-3 text-sm leading-5 text-muted-foreground tabular-nums">
                    <span>
                      {t("inStock", {
                        qty: format.quantity(subtype.inStock),
                        unit: item.unitShortName,
                      })}
                    </span>
                    {subtype.referencePrice !== null ? (
                      <span>{format.money(BigInt(subtype.referencePrice))}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            )),
          )}
        </ul>
      ) : null}
    </div>
  );
}
