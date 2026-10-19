import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { AdminNav } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { listBranches } from "@/features/catalog/queries/branches";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "./read-or-not-found";

// /branches (11-screens-and-ux.md, Screens: "Users and branches, /branches, Head"; build-plan
// 1.2). Every branch, active and inactive (04 rule 2), ordered by code, 25 a page with the page in
// the address (rule 8). The state is plain words, not a status label (docs/design-system.md, What
// we never do 4). At phone width the table scrolls inside its panel (plan of 1.2).

const pageParam = z.coerce.number().int().min(1).catch(1);

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireUser("/branches");
  const t = await getTranslations();
  const raw = (await searchParams).page;
  const asked = pageParam.parse(Array.isArray(raw) ? raw[0] : raw);
  const list = await readOrNotFound(() => listBranches(user.id, { page: asked }));
  const { page, pages } = list;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <AdminNav current="branches" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t("branches.title")}
          {list.rows.length > 0 && (
            <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
              {t("branches.summary", { active: list.active, inactive: list.inactive })}
            </span>
          )}
        </h1>
        {list.rows.length > 0 && (
          <Link href="/branches/new" className={buttonVariants({ className: "w-full sm:w-auto" })}>
            {t("branches.new")}
          </Link>
        )}
      </div>

      {list.rows.length === 0 ? (
        <EmptyState
          title={t("branches.emptyTitle")}
          line={t("branches.emptyText")}
          action={{ label: t("branches.new"), href: "/branches/new", icon: "add" }}
        />
      ) : (
        <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm leading-5">
            <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t("branches.code")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("branches.name")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("branches.address")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("branches.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((branch) => (
                <tr key={branch.id} className="border-t hover:bg-accent/50">
                  <td className="px-4 py-3 font-semibold">
                    <Link
                      href={`/branches/${branch.id}`}
                      className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
                    >
                      {branch.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{branch.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{branch.address}</td>
                  <td className="px-4 py-3">
                    {branch.isActive ? t("branches.active") : t("branches.inactive")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {pages > 1 && (
        <nav aria-label={t("pager.label")} className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={`/branches?page=${page - 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("pager.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            {t("pager.pageOf", { page, pages })}
          </span>
          {page < pages ? (
            <Link
              href={`/branches?page=${page + 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("pager.next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
