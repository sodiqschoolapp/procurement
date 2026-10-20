import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice, listMyBranches } from "@/features/catalog/queries/my-branches";
import { listSuggestions } from "@/features/catalog/queries/suggestions";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../branches/read-or-not-found";
import { PageLinks } from "../catalog/page-links";
import { SuggestionStatusText } from "./suggestion-status";

// /suggestions (build-plan 1.12; plan of 1.12, decision 4, Look first): the product suggestions of
// the branch view, every branch the person sees on "All" (11-screens-and-ux.md rule 1), pending
// first. Head and Manager; Principal and Finance get "Not found" (03 rule 1). A table on desktop,
// one card a suggestion at phone width.

const pageParam = z.coerce.number().int().min(1).catch(1);

type Params = { page?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SuggestionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/suggestions");
  const asked = pageParam.parse(first((await searchParams).page));
  const branchId = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);
  const list = await readOrNotFound(() => listSuggestions(user.id, { page: asked, branchId }));
  const branch = branchId
    ? (await listMyBranches(user.id)).find((each) => each.id === branchId)
    : undefined;
  const t = await getTranslations("suggestions");
  const format = await getFormatters();
  const { page, pages, rows } = list;
  const href = (to: number) => (to > 1 ? `/suggestions?page=${to}` : "/suggestions");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title">{t("title")}</h1>
          <p className="text-sm leading-5 text-muted-foreground">
            {branch ? t("oneBranch", { code: branch.code, name: branch.name }) : t("allBranches")}
          </p>
        </div>
        {rows.length > 0 && (
          <Link
            href="/suggestions/new"
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            {t("new")}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          line={t("emptyText")}
          action={{ label: t("new"), href: "/suggestions/new", icon: "add" }}
        />
      ) : (
        <>
          <section className="hidden overflow-x-auto rounded-xl bg-card text-card-foreground sm:block">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm leading-5">
              <thead className="bg-muted text-small font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.name")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.unitText")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.branch")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.by")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.date")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-accent/50">
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/suggestions/${row.id}`}
                        className="inline-flex items-center gap-3 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {row.photoFileId ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
                          <img
                            src={`/files/${row.photoFileId}/small`}
                            alt=""
                            width={40}
                            height={40}
                            className="size-10 shrink-0 rounded-md bg-muted object-cover"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Icon name="inventory_2" size={18} />
                          </span>
                        )}
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.unitText}</td>
                    <td className="px-4 py-3" title={row.branchName}>
                      {row.branchCode}
                    </td>
                    <td className="px-4 py-3">{row.suggestedByName}</td>
                    <td className="px-4 py-3 tabular-nums">{format.date(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <SuggestionStatusText status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <ul className="flex flex-col gap-3 sm:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/suggestions/${row.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-xl bg-card p-4 text-card-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {row.photoFileId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
                    <img
                      src={`/files/${row.photoFileId}/small`}
                      alt=""
                      width={48}
                      height={48}
                      className="size-12 shrink-0 rounded-md bg-muted object-cover"
                    />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon name="inventory_2" size={20} />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-semibold break-words">
                      {row.name}
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-sm leading-5 text-muted-foreground">
                      <span>{row.unitText}</span>
                      <span>{row.branchCode}</span>
                      <span className="tabular-nums">{format.date(row.createdAt)}</span>
                    </span>
                    <SuggestionStatusText status={row.status} />
                  </span>
                  <Icon name="chevron_right" className="shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && <PageLinks page={page} pages={pages} href={href} />}
    </div>
  );
}
