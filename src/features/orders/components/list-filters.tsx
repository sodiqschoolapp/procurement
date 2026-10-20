"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Icon } from "@/components/icon";
import { openSearch } from "@/components/shell/search";
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
// address; the list goes back to its first page, and the parameters of the drafts grid stay. The
// bar (docs/design-system.md, Filter bar): the search of the top bar, the key filters (branch,
// owner, sort) and "More filters" for the rest; each filter in force shows as a removable chip.
// On a phone everything folds behind "Filters (n)". The status is also the tabs above the list.
// The choices are the server's, of the user's branches only; the server reads every value again.

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
  const [more, setMore] = useState(false);
  const format = useFormatters();
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

  const branchName = (branchId: string) => {
    const found = branches.find((branch) => branch.id === branchId);
    return found ? `${found.code} ${found.name}` : null;
  };
  const named = <Item extends { id: string; name: string }>(items: readonly Item[], key: string) =>
    items.find((item) => item.id === key)?.name ?? null;
  const dateRange =
    filters.from || filters.to
      ? [filters.from ? format.date(filters.from) : "…", filters.to ? format.date(filters.to) : "…"]
      : null;

  // Each filter in force as a removable chip (design system, Filter bar).
  const chips: { key: string; label: string; remove: string; clear: () => void }[] = [];
  const chip = (key: string, label: string | null, clear: () => void, remove?: string) => {
    if (label !== null) {
      chips.push({ key, label, clear, remove: remove ?? t("remove", { filter: label }) });
    }
  };
  if (filters.status)
    chip("status", `${t("status")}: ${tStatus(filters.status)}`, () => set("status", null));
  if (filters.branch) {
    const name = branchName(filters.branch);
    chip("branch", name && `${t("branch")}: ${name}`, () => set("branch", null));
  }
  if (filters.owner) {
    const name = named(choices.owners, filters.owner);
    chip("owner", name && `${t("owner")}: ${name}`, () => set("owner", null));
  }
  if (filters.department) {
    const name = named(choices.departments, filters.department);
    chip("department", name && `${t("department")}: ${name}`, () => set("department", null));
  }
  if (filters.category) {
    const name = named(choices.categories, filters.category);
    chip("category", name && `${t("category")}: ${name}`, () => set("category", null));
  }
  if (filters.payment) {
    chip("payment", `${t("payment")}: ${tPayment(filters.payment)}`, () => set("payment", null));
  }
  if (dateRange) {
    chip("dates", `${t(`dateKinds.${filters.dates}`)}: ${dateRange.join(" – ")}`, () =>
      go({ ...filters, from: null, to: null }),
    );
  }
  if (filters.numberFrom || filters.numberTo) {
    chip(
      "numbers",
      `${t("numbers")}: ${filters.numberFrom ?? "…"} – ${filters.numberTo ?? "…"}`,
      () => go({ ...filters, numberFrom: null, numberTo: null }),
    );
  }
  if (filters.urgent) chip("urgent", t("urgent"), () => set("urgent", false));
  if (filters.action) chip("action", t("action"), () => set("action", null), t("removeAction"));
  if (filters.dueSoon) {
    chip("dueSoon", t("dueSoon"), () => set("dueSoon", false), t("removeDueSoon"));
  }
  if (filters.stuck) chip("stuck", t("stuck"), () => set("stuck", false), t("removeStuck"));

  // The filters behind "More filters" that are in force.
  const moreCount = [
    filters.status,
    filters.department,
    filters.category,
    filters.payment,
    dateRange,
    filters.numberFrom ?? filters.numberTo,
    filters.urgent || null,
  ].filter((value) => value !== null && value !== undefined).length;

  return (
    <section aria-labelledby={`${id}-title`} aria-busy={pending} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="sr-only">
        {t("label")}
      </h2>
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        {/* The search of the top bar, opened from here (11 rule 9). */}
        <button
          type="button"
          onClick={openSearch}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-strong bg-card px-3 text-left text-sm text-muted-foreground shadow-xs transition-colors duration-120 ease-out hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-9 sm:max-w-72"
        >
          <Icon name="search" size={18} />
          <span className="truncate">{t("search")}</span>
        </button>
        <Button
          type="button"
          variant="secondary"
          icon="filter_list"
          aria-expanded={shown}
          aria-controls={`${id}-panel`}
          onClick={() => setShown((open) => !open)}
          className="sm:hidden"
        >
          {count > 0 ? t("openCount", { count }) : t("open")}
        </Button>
        <div
          id={`${id}-panel`}
          className={cn("flex w-full flex-col gap-3 sm:contents", !shown && "max-sm:hidden")}
        >
          {branches.length > 1 && (
            <Field id={`${id}-branch`} label={t("branch")} className="sm:w-48">
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
          <Field id={`${id}-owner`} label={t("owner")} className="sm:w-48">
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
          <Field id={`${id}-sort`} label={t("sort")} className="sm:w-56">
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
          <Button
            type="button"
            variant="ghost"
            icon="tune"
            aria-expanded={more}
            aria-controls={`${id}-more`}
            onClick={() => setMore((open) => !open)}
            className="max-sm:hidden"
          >
            {moreCount > 0 ? t("moreCount", { count: moreCount }) : t("more")}
          </Button>
          <div
            id={`${id}-more`}
            className={cn(
              "grid w-full gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-5",
              !more && "sm:hidden",
            )}
          >
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
            <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end text-sm font-medium sm:min-h-9">
              <input
                type="checkbox"
                checked={filters.urgent}
                onChange={(event) => set("urgent", event.target.checked)}
                className="size-5 accent-primary sm:size-4"
              />
              {t("urgent")}
            </label>
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
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <ul aria-label={t("active")} className="flex flex-wrap items-center gap-2">
          {chips.map((item) => (
            <li
              key={item.key}
              data-filter-chip={item.key}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-card pr-0.5 pl-2.5 text-small font-medium max-sm:h-11"
            >
              {item.label}
              <button
                type="button"
                aria-label={item.remove}
                title={item.remove}
                onClick={item.clear}
                className="flex size-7 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-sm:size-10"
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
          <li>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => go({ ...NO_FILTERS, sort: filters.sort })}
            >
              {t("clear")}
            </Button>
          </li>
        </ul>
      )}
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
