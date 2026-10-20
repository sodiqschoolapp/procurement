import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { Icon } from "@/components/icon";
import { DEPARTMENTS } from "@/domain/catalogs";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { getDepartment } from "@/features/catalog/queries/departments";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { CatalogActiveButton } from "../../catalog-active-button";
import { CatalogForm } from "../../catalog-form";

// /catalog/departments/[id] (build-plan 1.6): the department's branch as text (it never changes,
// plan of 1.6, decision 1), its form, Deactivate or Activate (04 rule 2), and its change history
// (04 rule 9), where the branch shows by its code (decision 7). An unknown id, or one that is not
// an id, is "not found", as is any role without "Manage catalogs …" (03 rule 1).

const FIELDS: Record<string, HistoryField> = {
  branchId: { label: "catalog.fields.branch", kind: "text", hidden: true },
  branch: { label: "catalog.fields.branch", kind: "text" },
  name: { label: "catalog.fields.name", kind: "text" },
  responsibleName: { label: "catalog.fields.responsibleName", kind: "text" },
  responsiblePhone: { label: "catalog.fields.responsiblePhone", kind: "text" },
  isActive: { label: "catalog.fields.isActive", kind: "boolean" },
};

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/catalog/departments/${id}`);
  const department = await readOrNotFound(() => getDepartment(user.id, id));
  if (!department) notFound();
  const t = await getTranslations("catalog");
  const history = await listChangeHistory(user.id, {
    entity: DEPARTMENTS.entity,
    entityId: department.id,
  });
  const entry = {
    id: department.id,
    name: department.name,
    responsibleName: department.responsibleName,
    responsiblePhone: department.responsiblePhone,
    isActive: department.isActive,
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href="/catalog/departments"
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("kinds.departments.title")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
            {department.name}
            <span className="text-sm font-normal tracking-normal text-muted-foreground">
              {department.isActive ? t("active") : t("inactive")}
            </span>
          </h1>
          <p className="text-sm leading-5 text-muted-foreground">
            {t("branchLine", { code: department.branchCode, name: department.branchName })}
          </p>
        </div>
        <CatalogActiveButton kind="departments" entry={entry} />
      </div>
      <CatalogForm kind="departments" entry={entry} />
      <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
        <h2 className="text-subheading font-semibold">{t("history")}</h2>
        <ChangeHistory entries={history.rows} fields={FIELDS} />
      </section>
    </div>
  );
}
