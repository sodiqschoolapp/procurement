import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { AdminNav } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { listBranchVacancies, listUsers } from "@/features/users/queries/users";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../branches/read-or-not-found";

// /users (11-screens-and-ux.md, Screens: "Users and branches, /users, Head"; build-plan 1.3).
// Every user, active first (04 rule 2), 25 a page with the page in the address (rule 8). At the
// top the warning of 03 rule 5: each active branch with no active Manager, Principal or Finance
// user (plan of 1.3, decision 8). The state is plain words, not a status label (docs/design-
// system.md, What we never do 4). At phone width the table scrolls inside its panel.

const pageParam = z.coerce.number().int().min(1).catch(1);

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireUser("/users");
  const t = await getTranslations();
  const raw = (await searchParams).page;
  const asked = pageParam.parse(Array.isArray(raw) ? raw[0] : raw);
  const list = await readOrNotFound(() => listUsers(user.id, { page: asked }));
  const vacancies = await listBranchVacancies(user.id);
  const { page, pages } = list;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <AdminNav current="users" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {t("users.title")}
          {list.rows.length > 0 && (
            <span className="text-sm font-normal tracking-normal text-muted-foreground">
              {t("users.summary", { active: list.active, inactive: list.inactive })}
            </span>
          )}
        </h1>
        <Link href="/users/new" className={buttonVariants({ className: "w-full sm:w-auto" })}>
          {t("users.new")}
        </Link>
      </div>

      {vacancies.length > 0 && (
        <section
          aria-labelledby="vacancies-title"
          className="flex gap-3 rounded-xl bg-warning-bg p-4 text-foreground"
        >
          <Icon name="warning" className="mt-0.5 shrink-0 text-warning" />
          <div className="flex flex-col gap-1">
            <h2 id="vacancies-title" className="text-sm font-semibold">
              {t("users.vacancyTitle")}
            </h2>
            <ul className="flex flex-col gap-0.5 text-sm leading-5">
              {vacancies.map((branch) => (
                <li key={branch.id}>
                  {t("users.vacancy", {
                    branch: `${branch.code} · ${branch.name}`,
                    roles: branch.roles.map((role) => t(`roles.${role}`)).join(", "),
                  })}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {list.rows.length === 0 ? (
        <EmptyState
          title={t("users.emptyTitle")}
          line={t("users.emptyText")}
          action={{ label: t("users.new"), href: "/users/new", icon: "add" }}
        />
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-card text-card-foreground">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm leading-5">
            <thead className="bg-muted text-small font-semibold text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t("users.fullName")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("users.username")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("users.role")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("users.branches")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("users.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-accent/50">
                  <td className="px-4 py-3 font-semibold">
                    <Link
                      href={`/users/${row.id}`}
                      className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
                    >
                      {row.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.username}</td>
                  <td className="px-4 py-3">{t(`roles.${row.role}`)}</td>
                  <td className="px-4 py-3">
                    {row.branches.map((branch) => branch.code).join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    {row.isActive ? t("users.active") : t("users.inactive")}
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
              href={`/users?page=${page - 1}`}
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
              href={`/users?page=${page + 1}`}
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
