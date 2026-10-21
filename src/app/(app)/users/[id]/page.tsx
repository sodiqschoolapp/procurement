import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { MANAGER_RIGHTS } from "@/domain/permissions";
import { getManagerRights, getUser, listBranchChoices } from "@/features/users/queries/users";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { ManagerRights } from "../manager-rights";
import { RenewPassword } from "../renew-password";
import { UserActiveButton } from "../user-active-button";
import { UserForm } from "../user-form";

// /users/[id] (build-plan 1.3): the user's form, Renew password (A8), Deactivate or Activate
// (04 rule 2; 03 rules 3 and 4), and the change history (04 rule 9). An unknown id, or one that
// is not an id, is "not found", as is any role without "Manage … users" (03 rule 1). A Manager's
// page also has the nine rights (build-plan 1.4).

const FIELDS: Record<string, HistoryField> = {
  fullName: { label: "users.fullName", kind: "text" },
  username: { label: "users.username", kind: "text" },
  phone: { label: "users.phone", kind: "text" },
  role: { label: "users.role", kind: { enum: "roles" } },
  locale: { label: "users.language", kind: { enum: "languages" } },
  branches: { label: "users.branches", kind: "text" },
  isActive: { label: "users.isActive", kind: "boolean" },
  // The rights switched (plan of 1.4, decision 6): one boolean per code.
  ...Object.fromEntries(
    MANAGER_RIGHTS.map((right) => [
      right,
      { label: `managerRights.names.${right}`, kind: "boolean" } satisfies HistoryField,
    ]),
  ),
};

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/users/${id}`);
  const shown = await readOrNotFound(() => getUser(user.id, id));
  if (!shown) notFound();
  const choices = await listBranchChoices(user.id, shown.id);
  const t = await getTranslations();
  const rights = shown.role === "MANAGER" ? await getManagerRights(user.id, shown.id) : null;
  const history = await listChangeHistory(user.id, { entity: "users", entityId: shown.id });
  const own = shown.id === user.id;
  const replaces =
    shown.role === "PRINCIPAL" && !shown.isActive
      ? (choices.find((choice) => choice.id === shown.branches[0]?.id)?.principal ?? null)
      : null;

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AdminNav current="users" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {shown.fullName}
          <span className="text-sm font-normal tracking-normal text-muted-foreground">
            {t("users.fact", {
              role: t(`roles.${shown.role}`),
              state: shown.isActive ? t("users.active") : t("users.inactive"),
            })}
          </span>
        </h1>
        {shown.isActive && (own || shown.lastActiveHead) ? (
          <p className="text-sm leading-5 text-muted-foreground sm:max-w-72">
            {t(own ? "users.ownAccount" : "users.lastHead")}
          </p>
        ) : (
          <UserActiveButton user={shown} replaces={replaces} />
        )}
      </div>
      <UserForm user={shown} choices={choices} />
      {rights && <ManagerRights user={shown} rights={rights} />}
      {own ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm leading-5 text-muted-foreground sm:p-5">
          {t("users.renewOwn")}
        </p>
      ) : (
        <RenewPassword user={shown} />
      )}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
        <h2 className="text-subheading font-semibold">{t("users.history")}</h2>
        <ChangeHistory entries={history.rows} fields={FIELDS} />
      </section>
    </div>
  );
}
