import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/select";

import type { AnalyticsFilterOptions, FilterOption } from "../queries/filters";
import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { FilterFold } from "./filter-fold";

// The period picker and the filters of an Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, points 1 and 2; build-plan 6.3), one row above the blocks. A plain GET
// form: the choice stays in the address, so a link reopens the same view (11 rule 8). At phone
// width the fields fold behind "Filters" (filter-fold.tsx) (plan of 6.3, Screens). The custom dates count only with
// "Custom dates" (period-params.ts). `noManager` leaves the Manager filter out: the Manager's page,
// whose blocks are the user's own orders (plan of 6.5b, decided item 6, Look first).

export async function AnalyticsFilterBar({
  action,
  period,
  filters,
  options,
  noManager = false,
}: {
  action: string;
  period: PeriodInput;
  filters: AnalyticsFilters;
  options: AnalyticsFilterOptions;
  noManager?: boolean;
}) {
  const t = await getTranslations("analytics");
  const named = (option: FilterOption, name = option.name) =>
    option.isActive ? name : t("inactive", { name });
  const field = "flex flex-col gap-1 text-sm leading-5 font-semibold";
  return (
    <FilterFold label={t("filters")}>
      <form
        role="search"
        action={action}
        className="flex flex-wrap items-end gap-3 max-sm:flex-col max-sm:items-stretch"
      >
        <label className={field}>
          {t("period")}
          <Select
            name="period"
            defaultValue={period.choice}
            className="w-full sm:w-44"
            data-filter-period
          >
            {options.periods.map((choice) => (
              <option key={choice} value={choice}>
                {t(`periods.${choice}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className={field}>
          {t("from")}
          <DateInput
            name="from"
            defaultValue={period.from ?? ""}
            className="sm:w-40"
            data-filter-from
          />
        </label>
        <label className={field}>
          {t("to")}
          <DateInput name="to" defaultValue={period.to ?? ""} className="sm:w-40" data-filter-to />
        </label>
        <label className={field}>
          {t("branch")}
          <Select
            name="branch"
            defaultValue={filters.branch ?? "all"}
            className="w-full sm:w-48"
            data-filter-branch
          >
            <option value="all">{t("allBranches")}</option>
            {options.branches.map((option) => (
              <option key={option.id} value={option.id}>
                {named(option)}
              </option>
            ))}
          </Select>
        </label>
        <label className={field}>
          {t("category")}
          <Select
            name="category"
            defaultValue={filters.category ?? ""}
            className="w-full sm:w-48"
            data-filter-category
          >
            <option value="">{t("allCategories")}</option>
            {options.categories.map((option) => (
              <option key={option.id} value={option.id}>
                {named(option)}
              </option>
            ))}
          </Select>
        </label>
        <label className={field}>
          {t("department")}
          <Select
            name="department"
            defaultValue={filters.department ?? ""}
            className="w-full sm:w-48"
            data-filter-department
          >
            <option value="">{t("allDepartments")}</option>
            {options.departments.map((option) => (
              <option key={option.id} value={option.id}>
                {named(
                  option,
                  options.branches.length > 1
                    ? t("departmentOption", { name: option.name, branch: option.branchName })
                    : option.name,
                )}
              </option>
            ))}
          </Select>
        </label>
        {!noManager && (
          <label className={field}>
            {t("manager")}
            <Select
              name="manager"
              defaultValue={filters.manager ?? ""}
              className="w-full sm:w-48"
              data-filter-manager
            >
              <option value="">{t("allManagers")}</option>
              {options.managers.map((option) => (
                <option key={option.id} value={option.id}>
                  {named(option)}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className={field}>
          {t("supplier")}
          <Select
            name="supplier"
            defaultValue={filters.supplier ?? ""}
            className="w-full sm:w-48"
            data-filter-supplier
          >
            <option value="">{t("allSuppliers")}</option>
            {options.suppliers.map((option) => (
              <option key={option.id} value={option.id}>
                {named(option)}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          {t("apply")}
        </button>
        <Link href={`${action}?branch=all`} className={buttonVariants({ variant: "ghost" })}>
          {t("reset")}
        </Link>
      </form>
    </FilterFold>
  );
}
