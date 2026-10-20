import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import * as z from "zod";

import { AdminNav } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { listDepartments } from "@/features/catalog/queries/departments";
import { currentBranchChoice, listMyBranches } from "@/features/catalog/queries/my-branches";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { PageLinks } from "../page-links";

// /catalog/departments (build-plan 1.6; 11-screens-and-ux.md rules 1, 8 and 12): the Head's
// departments of the branch view chosen in the top bar, every branch on "All" (plan of 1.6,
// decision 10), active and inactive (04 rule 2), active first, then by branch and name; the search
// and the page stay in the address. At phone width the table scrolls inside its panel.

const pageParam = z.coerce.number().int().min(1).catch(1);
const searchParam = z.string().trim().max(200).catch("");

type Params = { page?: string | string[]; q?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/catalog/departments");
  const raw = await searchParams;
  const q = searchParam.parse(first(raw.q) ?? "");
  const asked = pageParam.parse(first(raw.page));
  const branchId = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);
  const list = await readOrNotFound(() => listDepartments(user.id, { page: asked, q, branchId }));
  const branch = branchId
    ? (await listMyBranches(user.id)).find((each) => each.id === branchId)
    : undefined;
  const t = await getTranslations("catalog");
  const { page, pages } = list;
  const empty = list.active + list.inactive === 0;
  const href = (to: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (to > 1) query.set("page", String(to));
    const text = query.toString();
    return `/catalog/departments${text ? `?${text}` : ""}`;
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href="/catalog"
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
            {t("kinds.departments.title")}
            {!empty && (
              <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
                {t("summary", { active: list.active, inactive: list.inactive })}
              </span>
            )}
          </h1>
          <p className="text-sm leading-5 text-muted-foreground">
            {branch ? t("oneBranch", { code: branch.code, name: branch.name }) : t("allBranches")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {/* The Excel import (build-plan 1.10), also on an empty list, where it helps most. */}
          <Link
            href="/catalog/import/departments"
            className={buttonVariants({ variant: "secondary", className: "w-full sm:w-auto" })}
          >
            {t("importButton")}
          </Link>
          {!empty && (
            <Link
              href="/catalog/departments/new"
              className={buttonVariants({ className: "w-full sm:w-auto" })}
            >
              {t("kinds.departments.new")}
            </Link>
          )}
        </div>
      </div>

      {empty ? (
        <EmptyState
          title={t("kinds.departments.emptyTitle")}
          line={t("kinds.departments.emptyText")}
          action={{
            label: t("kinds.departments.new"),
            href: "/catalog/departments/new",
            icon: "add",
          }}
        />
      ) : (
        <>
          <form
            role="search"
            action="/catalog/departments"
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="catalog-search" className="sr-only">
              {t("search")}
            </label>
            <input
              id="catalog-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t("searchHint")}
              maxLength={200}
              className="h-11 w-full min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10 sm:max-w-80 sm:text-sm sm:leading-5"
            />
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("find")}
            </button>
            {q && (
              <Link href="/catalog/departments" className={buttonVariants({ variant: "ghost" })}>
                {t("clear")}
              </Link>
            )}
          </form>

          {list.rows.length === 0 ? (
            <EmptyState title={t("noResultsTitle")} line={t("noResultsText")} />
          ) : (
            <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm leading-5">
                <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.name")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.branch")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.responsibleName")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.phone")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-accent/50">
                      <td className="px-4 py-3 font-semibold">
                        <Link
                          href={`/catalog/departments/${row.id}`}
                          className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3" title={row.branchName}>
                        {row.branchCode}
                      </td>
                      <td className="px-4 py-3">{row.responsibleName}</td>
                      <td className="px-4 py-3 tabular-nums">{row.responsiblePhone}</td>
                      <td className="px-4 py-3">{row.isActive ? t("active") : t("inactive")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {pages > 1 && <PageLinks page={page} pages={pages} href={href} />}
    </div>
  );
}
