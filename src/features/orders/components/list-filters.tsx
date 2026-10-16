"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { LIST_STATUSES } from "@/domain/order-list";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import {
  DATE_KINDS,
  LIST_SORTS,
  type ListFilters,
  NO_FILTERS,
  activeFilterCount,
  listFiltersParams,
  parseListFilters,
} from "@/features/orders/list-filters";
import type { ListFilterChoices } from "@/features/orders/queries/order-list";
import { parseTypedDate } from "@/i18n/format";
import { useFormatters } from "@/i18n/use-formatters";

// The filters and the sort of the order list (05-order-request-form.md, Ticking and filters;
// 11-screens-and-ux.md, Order list layout 1; rule 8: "Filters and sorting stay in the address, so
// a link reopens the same view"; plan of 2.8, decided items 9 to 13). Each change replaces the
// address; the list goes back to its first page, and the parameters of the drafts grid stay. On a
// phone the filters fold behind "Filters (n)". The choices are the server's, of the user's
// branches only; the server reads every value again.

type Branch = { id: string; code: string; name: string; isActive: boolean };

export function ListFiltersBar({
  filters,
  ignored,
  branches,
  choices,
  topBarBranch,
}: {
  filters: ListFilters;
  ignored: readonly "numberTo"[];
  branches: readonly Branch[];
  choices: ListFilterChoices;
  /** Without `branch=` the list follows the top bar's branch, this one (decided item 12). */
  topBarBranch: string | null;
}) {
  const t = useTranslations("orders.list.filters");
  const tStatus = useTranslations("requestStatus");
  const tPayment = useTranslations("paymentTypes");
  const router = useRouter();
  const current = useSearchParams();
  const [pending, start] = useTransition();
  const [shown, setShown] = useState(false);
  const id = useId();
  const count = activeFilterCount(filters);

  function go(next: ListFilters) {
    const params = listFiltersParams(next);
    // The drafts grid's own parameters stay (decided item 12).
    for (const name of ["owners", "draftsPage"]) {
      const value = current.get(name);
      if (value !== null) params.set(name, value);
    }
    const text = params.toString();
    start(() => router.replace(`/orders${text ? `?${text}` : ""}`, { scroll: false }));
  }

  const set = <Key extends keyof ListFilters>(key: Key, value: ListFilters[Key]) =>
    go({ ...filters, [key]: value });

  const pick = (key: "branch" | "owner" | "department" | "category", value: string) =>
    set(key, value === "" ? null : value);

  const inactive = (name: string, isActive: boolean) => (isActive ? name : t("inactive", { name }));

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`${id}-title`} className="sr-only">
          {t("label")}
        </h2>
        <Button
          type="button"
          variant="secondary"
          icon="tune"
          aria-expanded={shown}
          aria-controls={`${id}-panel`}
          onClick={() => setShown((open) => !open)}
          className="sm:hidden"
        >
          {count > 0 ? t("openCount", { count }) : t("open")}
        </Button>
        {filters.action && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted py-1 pr-1 pl-3 text-sm font-semibold">
            {t("action")}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("removeAction")}
              onClick={() => set("action", null)}
            >
              <Icon name="close" size={18} />
            </Button>
          </span>
        )}
        {count > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => go({ ...NO_FILTERS, sort: filters.sort })}
          >
            {t("clear")}
          </Button>
        )}
      </div>

      <div
        id={`${id}-panel`}
        aria-busy={pending}
        className={cn(
          "grid gap-3 rounded-xl bg-card p-4 sm:grid-cols-3 lg:grid-cols-6",
          !shown && "max-sm:hidden",
        )}
      >
        <Field id={`${id}-sort`} label={t("sort")}>
          <Select
            value={filters.sort}
            onChange={(event) =>
              set("sort", parseListFilters({ sort: event.target.value }).filters.sort)
            }
          >
            {LIST_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sorts.${sort}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-status`} label={t("status")}>
          <Select
            value={filters.status ?? ""}
            onChange={(event) =>
              set("status", parseListFilters({ status: event.target.value }).filters.status)
            }
          >
            <option value="">{t("any")}</option>
            {LIST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
        </Field>
        {branches.length > 1 && (
          <Field id={`${id}-branch`} label={t("branch")}>
            <Select
              value={filters.branch ?? ""}
              onChange={(event) => pick("branch", event.target.value)}
            >
              <option value="">{topBarBranch ? t("topBar") : t("any")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {inactive(`${branch.code} ${branch.name}`, branch.isActive)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field id={`${id}-owner`} label={t("owner")}>
          <Select
            value={filters.owner ?? ""}
            onChange={(event) => pick("owner", event.target.value)}
          >
            <option value="">{t("any")}</option>
            {choices.owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {inactive(owner.name, owner.isActive)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-department`} label={t("department")}>
          <Select
            value={filters.department ?? ""}
            onChange={(event) => pick("department", event.target.value)}
          >
            <option value="">{t("any")}</option>
            {choices.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {inactive(`${department.branchCode} ${department.name}`, department.isActive)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-category`} label={t("category")}>
          <Select
            value={filters.category ?? ""}
            onChange={(event) => pick("category", event.target.value)}
          >
            <option value="">{t("any")}</option>
            {choices.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {inactive(category.name, category.isActive)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-payment`} label={t("payment")}>
          <Select
            value={filters.payment ?? ""}
            onChange={(event) =>
              set("payment", parseListFilters({ payment: event.target.value }).filters.payment)
            }
          >
            <option value="">{t("any")}</option>
            {PAYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tPayment(type)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-dates`} label={t("dates")}>
          <Select
            value={filters.dates}
            onChange={(event) =>
              set("dates", parseListFilters({ dates: event.target.value }).filters.dates)
            }
          >
            {DATE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`dateKinds.${kind}`)}
              </option>
            ))}
          </Select>
        </Field>
        <DateField
          id={`${id}-from`}
          label={t("from")}
          value={filters.from}
          onValue={(value) => set("from", value)}
        />
        <DateField
          id={`${id}-to`}
          label={t("to")}
          value={filters.to}
          onValue={(value) => set("to", value)}
        />
        <NumberField
          id={`${id}-number-from`}
          label={t("numberFrom")}
          value={filters.numberFrom}
          onValue={(value) => set("numberFrom", value)}
        />
        <NumberField
          id={`${id}-number-to`}
          label={t("numberTo")}
          value={filters.numberTo}
          onValue={(value) => set("numberTo", value)}
          note={ignored.includes("numberTo") ? t("numberToIgnored") : undefined}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end text-sm font-semibold">
          <input
            type="checkbox"
            checked={filters.urgent}
            onChange={(event) => set("urgent", event.target.checked)}
            className="size-5 accent-foreground sm:size-4"
          />
          {t("urgent")}
        </label>
      </div>
    </section>
  );
}

/** A Tashkent date typed as it is shown, `08.10.2026`; applied on Enter or when left. */
function DateField({
  id,
  label,
  value,
  onValue,
}: {
  id: string;
  label: string;
  value: string | null;
  onValue: (value: string | null) => void;
}) {
  const t = useTranslations("orders");
  const format = useFormatters();
  const shownValue = value ? format.date(value) : "";
  const [text, setText] = useState(shownValue);
  const [wrong, setWrong] = useState(false);
  const [held, setHeld] = useState(value);
  if (held !== value) {
    // The address changed: show its date.
    setHeld(value);
    setText(shownValue);
    setWrong(false);
  }

  function apply() {
    const trimmed = text.trim();
    if (trimmed === "") {
      setWrong(false);
      if (value !== null) onValue(null);
      return;
    }
    const date = parseTypedDate(trimmed);
    setWrong(date === null);
    if (date !== null && date !== value) onValue(date);
  }

  return (
    <Field id={id} label={label} error={wrong ? t("date.invalid") : undefined}>
      <Input
        inputMode="numeric"
        placeholder={t("date.placeholder")}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply();
        }}
      />
    </Field>
  );
}

/** An order number such as CHL-26-0142; applied on Enter or when left. */
function NumberField({
  id,
  label,
  value,
  onValue,
  note,
}: {
  id: string;
  label: string;
  value: string | null;
  onValue: (value: string | null) => void;
  note?: string;
}) {
  const t = useTranslations("orders.list.filters");
  const [text, setText] = useState(value ?? "");
  const [wrong, setWrong] = useState(false);
  const [held, setHeld] = useState(value);
  if (held !== value) {
    setHeld(value);
    setText(value ?? "");
    setWrong(false);
  }

  function apply() {
    const trimmed = text.trim();
    if (trimmed === "") {
      setWrong(false);
      if (value !== null) onValue(null);
      return;
    }
    const number = parseListFilters({ numberFrom: trimmed }).filters.numberFrom;
    setWrong(number === null);
    if (number !== null && number !== value) onValue(number);
  }

  return (
    <Field id={id} label={label} error={wrong ? t("numberInvalid") : note}>
      <Input
        placeholder={t("numberPlaceholder")}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply();
        }}
      />
    </Field>
  );
}
