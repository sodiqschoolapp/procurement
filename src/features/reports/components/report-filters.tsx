import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { FilterFold } from "../../analytics/components/filter-fold";
import type { AnalyticsFilterOptions, FilterOption } from "../../analytics/queries/filters";
import type { ReportParams } from "../report-params";

// The filters of /reports (10-notifications-analytics-reports.md, Reports: "Every report filters
// by branch, date range and category"; build-plan 6.8): one plain GET form that keeps the report,
// so the choice stays in the address and a link reopens the same view (11 rule 8). The branches
// are the user's own (getAnalyticsFilters()); at phone width the fields fold behind "Filters", as
// on /analytics.

export async function ReportFilters({
  params,
  options,
}: {
  params: ReportParams;
  options: AnalyticsFilterOptions;
}) {
  const t = await getTranslations("reports");
  const tAnalytics = await getTranslations("analytics");
  const named = (option: FilterOption) =>
    option.isActive ? option.name : tAnalytics("inactive", { name: option.name });
  const field = "flex flex-col gap-1 text-sm leading-5 font-semibold";
  return (
    <FilterFold label={t("filters")}>
      <form
        role="search"
        action="/reports"
        className="flex flex-wrap items-end gap-3 max-sm:flex-col max-sm:items-stretch"
      >
        <input type="hidden" name="report" value={params.report} />
        {params.report === "prices" && params.variant && (
          <input type="hidden" name="variant" value={params.variant} />
        )}
        <label className={field}>
          {t("from")}
          <Input
            type="date"
            name="from"
            defaultValue={params.range.first}
            className="sm:w-40"
            data-filter-from
          />
        </label>
        <label className={field}>
          {t("to")}
          <Input
            type="date"
            name="to"
            defaultValue={params.range.last}
            className="sm:w-40"
            data-filter-to
          />
        </label>
        <label className={field}>
          {t("branch")}
          <Select
            name="branch"
            defaultValue={params.filters.branch ?? "all"}
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
            defaultValue={params.filters.category ?? ""}
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
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          {t("apply")}
        </button>
        <Link
          href={`/reports?report=${params.report}`}
          className={buttonVariants({ variant: "ghost" })}
        >
          {t("reset")}
        </Link>
      </form>
    </FilterFold>
  );
}
