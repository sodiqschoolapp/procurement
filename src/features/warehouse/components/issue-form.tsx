"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import {
  issueFormChoicesAction,
  issueStockAction,
  searchIssueItemsAction,
} from "@/app/(app)/warehouse/documents/new/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FIELD_CLASSES, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { DOCUMENT_LINES_MAX, issueQuantityRefusal } from "@/domain/stock-documents";
import type {
  IssueBranch,
  IssueDepartment,
  IssueItem,
} from "@/features/warehouse/queries/issue-form";
import { useFormatters } from "@/i18n/use-formatters";

import { DOCUMENT_STEPS, firstDocumentStepWithError } from "./document-steps";

// The issue form (09-warehouse.md, Issue to a department: Branch, Date, Department, Received by,
// Lines with the current stock beside each, Comment; plan of 5.4, Screens). The branch is
// prefilled when the user has one (or the branch view names one); Received by is prefilled with
// the chosen department's responsible person and can be changed. A line is added from the search
// of the branch's stock (active goods with stock above 0, decided item 3). The quantity field says
// "More than in stock" at once from the stock shown (issueQuantityRefusal() of the domain); the
// server checks again under the lock and names the item and the amount left (09 Issue 1; decided
// item 2), which the line then shows as its stock. Changing the form's branch with lines typed asks
// first, and the old branch's lines and department leave the form (.claude/rules/ui.md). At phone
// width (below `sm`) one step at a time, as the purchase form of 3.9: hidden steps are hidden by
// CSS only, so every field stays in the form and is sent. After a save the number, the note's
// download and "New issue" take the form's place. No confirmation (decided item 9).

type Line = {
  variantId: string;
  qty: string;
  /** What the line shows: the product and subtype, the stock, the measure. */
  productName: string;
  subtypeName: string | null;
  inStock: string;
  unitShortName: string;
  allowsDecimals: boolean;
};

type Values = {
  branchId: string;
  docDate: string;
  departmentId: string;
  receivedByName: string;
  comment: string;
  lines: Line[];
};

type Saved = { documentId: string; number: string };

const SEARCH_PAUSE_MS = 250;

const noSubscription = () => () => undefined;

export function IssueForm({
  branches,
  initialBranchId,
  initialDepartments,
  today,
}: {
  branches: readonly IssueBranch[];
  /** The branch prefilled: the only one, or the branch view's; empty when the user must choose. */
  initialBranchId: string;
  initialDepartments: readonly IssueDepartment[];
  /** Today in Tashkent, `YYYY-MM-DD`: the default date and the latest allowed. */
  today: string;
}) {
  const t = useTranslations("warehouse.issue");
  const tAll = useTranslations();
  const format = useFormatters();
  const action = useAction(issueStockAction, { create: true });
  const [departments, setDepartments] = useState(initialDepartments);
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
    departmentId: "",
    receivedByName: "",
    comment: "",
    lines: [],
  });
  const { register, handleSubmit, control, setValue, reset, formState } = useForm<Values>({
    defaultValues: empty(initialBranchId),
  });
  const lines = useFieldArray({ control, name: "lines" });
  const values = useWatch({ control }) as Values;
  const fieldTexts = action.fieldTexts;
  const available = action.result && !action.result.ok ? action.result.error.available : undefined;

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

  /** The form's branch changes: the old branch's department and lines leave the form. */
  async function switchBranch(branchId: string) {
    reset({ ...empty(branchId), docDate: values.docDate });
    setDepartments([]);
    action.forget();
    if (branchId === "") return;
    const answer = await issueFormChoicesAction({ branchId });
    if (answer.ok) setDepartments(answer.data);
    else toast.error(tAll(answer.error.messageKey));
  }

  function chooseDepartment(departmentId: string) {
    setValue("departmentId", departmentId, { shouldDirty: true });
    const chosen = departments.find((each) => each.id === departmentId);
    setValue("receivedByName", chosen?.responsibleName ?? "", { shouldDirty: true });
  }

  function addLine(item: IssueItem, subtype: IssueItem["subtypes"][number]) {
    const at = values.lines.findIndex((line) => line.variantId === subtype.id);
    if (at >= 0) {
      document.getElementById(`issue-qty-${at}`)?.focus();
      return;
    }
    lines.append({
      variantId: subtype.id,
      qty: "",
      productName: item.name,
      subtypeName: subtype.name,
      inStock: subtype.inStock,
      unitShortName: item.unitShortName,
      allowsDecimals: item.allowsDecimals,
    });
  }

  /** The stock a line shows: the amount left the server named, else the stock when it was added. */
  const stockOf = (index: number) =>
    available?.[`lines.${index}.qty`] ?? values.lines[index]?.inStock ?? "0";

  function lineError(index: number): string | undefined {
    const line = values.lines[index];
    if (!line) return undefined;
    const left = available?.[`lines.${index}.qty`];
    if (left !== undefined) {
      return t("short", {
        item: line.subtypeName ? `${line.productName} · ${line.subtypeName}` : line.productName,
        available: format.quantity(left),
        unit: line.unitShortName,
      });
    }
    if (line.qty.trim() !== "") {
      const refusal = issueQuantityRefusal(line.qty, line.allowsDecimals, stockOf(index));
      if (refusal === "stockShort") return t("moreThanStock");
      if (refusal) return tAll(`errors.field.${refusal}`);
    }
    return fieldTexts[`lines.${index}.qty`];
  }

  const onSubmit = handleSubmit(async (typed) => {
    const result = await action.run({
      branchId: typed.branchId,
      docDate: typed.docDate,
      departmentId: typed.departmentId,
      receivedByName: typed.receivedByName,
      comment: typed.comment.trim() === "" ? null : typed.comment,
      lines: typed.lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
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
        data-issue-saved
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h2 className="flex items-center gap-2 text-[17px] leading-6 font-semibold">
          <Icon name="check_circle" className="text-success" />
          {t("savedTitle", { number: saved.number })}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href={`/warehouse/documents/${saved.documentId}/note`}
            download
            className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
          >
            <Icon name="download" />
            {t("downloadNote")}
          </a>
          <Button
            className="max-sm:h-12"
            icon="add"
            onClick={() => {
              setSaved(null);
              action.forget();
              reset({ ...empty(values.branchId), departmentId: "", receivedByName: "" });
              setStep(0);
            }}
          >
            {t("newIssue")}
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
          void switchBranch(next);
        }}
      />

      <section data-step={0} aria-labelledby="issue-step-0" className={stepClass(0)}>
        <h2
          id="issue-step-0"
          data-step-heading
          tabIndex={-1}
          className="text-[17px] leading-6 font-semibold outline-none"
        >
          {t("whoAndWhen")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {branches.length > 1 ? (
            <Field id="issue-branch" label={t("branch")} error={fieldTexts.branchId}>
              <Select
                value={values.branchId}
                onChange={(event) => {
                  const next = event.target.value;
                  if (values.lines.length > 0) setPendingBranch(next);
                  else void switchBranch(next);
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
            <p className="flex flex-col gap-1.5 text-[15px] leading-[22px]">
              <span className="text-sm leading-5 font-semibold">{t("branch")}</span>
              {branches[0]
                ? tAll("branch.option", { code: branches[0].code, name: branches[0].name })
                : null}
            </p>
          )}
          <Field id="issue-date" label={t("date")} error={fieldTexts.docDate}>
            <Input
              type="date"
              max={today}
              {...register("docDate", { required: true })}
              fieldSize="default"
              className="max-sm:h-12"
            />
          </Field>
          <Field id="issue-department" label={t("department")} error={fieldTexts.departmentId}>
            <Select
              value={values.departmentId}
              disabled={!branchChosen}
              onChange={(event) => chooseDepartment(event.target.value)}
            >
              <option value="">{t("chooseDepartment")}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="issue-received-by" label={t("receivedBy")} error={fieldTexts.receivedByName}>
            <Input {...register("receivedByName")} maxLength={120} className="max-sm:h-12" />
          </Field>
        </div>
      </section>

      <section data-step={1} aria-labelledby="issue-step-1" className={stepClass(1)}>
        <h2
          id="issue-step-1"
          data-step-heading
          tabIndex={-1}
          className="text-[17px] leading-6 font-semibold outline-none"
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
          <p className="text-[15px] leading-[22px] text-muted-foreground">{t("branchFirst")}</p>
        )}
        {fieldTexts.lines ? (
          <p role="alert" className="text-[15px] leading-[22px] text-destructive">
            {fieldTexts.lines}
          </p>
        ) : null}
        {lines.fields.length === 0 ? (
          <p className="text-[15px] leading-[22px] text-muted-foreground">{t("noLines")}</p>
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
                  data-issue-line={line.variantId}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-start"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] leading-[22px] font-semibold">{name}</span>
                    <span data-in-stock className="text-sm leading-5 text-muted-foreground">
                      {t("inStock", {
                        qty: format.quantity(stockOf(index)),
                        unit: line.unitShortName,
                      })}
                    </span>
                    {fieldTexts[`lines.${index}.variantId`] ? (
                      <span className="text-sm leading-5 text-destructive">
                        {fieldTexts[`lines.${index}.variantId`]}
                      </span>
                    ) : null}
                  </div>
                  <Field
                    id={`issue-qty-${index}`}
                    label={t("quantity", { unit: line.unitShortName })}
                    error={lineError(index)}
                    className="sm:w-48"
                  >
                    <Input
                      inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                      autoComplete="off"
                      {...register(`lines.${index}.qty`)}
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

      <section data-step={2} aria-labelledby="issue-step-2" className={stepClass(2)}>
        <h2
          id="issue-step-2"
          data-step-heading
          tabIndex={-1}
          className="text-[17px] leading-6 font-semibold outline-none"
        >
          {t("commentStep")}
        </h2>
        <Field id="issue-comment" label={t("comment")} error={fieldTexts.comment}>
          <textarea
            {...register("comment")}
            rows={3}
            maxLength={1000}
            className={cn(FIELD_CLASSES, "min-h-24 py-2")}
          />
        </Field>
      </section>

      {action.errorText && Object.keys(fieldTexts).length === 0 ? (
        <p role="alert" className="text-[15px] leading-[22px] text-destructive">
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
        <span data-step-count className="text-[15px] leading-[22px] tabular-nums">
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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

/**
 * The search of the branch's stock: up to 20 products by name with their subtypes in stock. The
 * "nothing found" line shows only once the answer for the text typed now has come
 * (.claude/rules/ui.md).
 */
function ItemSearch({
  branchId,
  full,
  onPick,
}: {
  branchId: string;
  full: boolean;
  onPick: (item: IssueItem, subtype: IssueItem["subtypes"][number]) => void;
}) {
  const t = useTranslations("warehouse.issue");
  const tAll = useTranslations();
  const format = useFormatters();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ q: string; items: IssueItem[] } | null>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      const found = await searchIssueItemsAction({ branchId, q });
      if (!current) return;
      if (found.ok) setAnswer({ q, items: found.data });
      else toast.error(tAll(found.error.messageKey));
    }, SEARCH_PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [branchId, q, tAll]);

  const answered = answer !== null && answer.q === q;
  return (
    <div className="flex flex-col gap-2">
      <Field id="issue-search" label={t("search")}>
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
      ) : answered && answer.items.length === 0 ? (
        <p data-nothing-found className="text-sm leading-5 text-muted-foreground">
          {t("nothingFound")}
        </p>
      ) : answer ? (
        <ul aria-label={t("results")} className="flex max-h-72 flex-col overflow-y-auto">
          {answer.items.flatMap((item) =>
            item.subtypes.map((subtype) => (
              <li key={subtype.id}>
                <button
                  type="button"
                  data-pick={subtype.id}
                  onClick={() => onPick(item, subtype)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[15px] leading-[22px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0">
                    {subtype.name ? `${item.name} · ${subtype.name}` : item.name}
                  </span>
                  <span className="shrink-0 text-sm leading-5 text-muted-foreground tabular-nums">
                    {t("inStock", {
                      qty: format.quantity(subtype.inStock),
                      unit: item.unitShortName,
                    })}
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
