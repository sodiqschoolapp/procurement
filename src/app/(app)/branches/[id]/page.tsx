import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { getBranch } from "@/features/catalog/queries/branches";
import { requireUser } from "@/server/auth/session";

import { BranchActiveButton } from "../branch-active-button";
import { BranchForm } from "../branch-form";
import { readOrNotFound } from "../read-or-not-found";

// /branches/[id] (build-plan 1.2): the branch's form, Deactivate or Activate (04 rule 2), and its
// change history (04 rule 9). An unknown id, or one that is not an id, is "not found", as is any
// role without "Manage … branches" (03 rule 1).

const FIELDS: Record<string, HistoryField> = {
  name: { label: "branches.name", kind: "text" },
  code: { label: "branches.code", kind: "text" },
  address: { label: "branches.address", kind: "text" },
  isActive: { label: "branches.isActive", kind: "boolean" },
};

export default async function BranchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/branches/${id}`);
  const branch = await readOrNotFound(() => getBranch(user.id, id));
  if (!branch) notFound();
  const t = await getTranslations();
  const history = await listChangeHistory(user.id, { entity: "branches", entityId: branch.id });

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AdminNav current="branches" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {branch.name}
          <span className="text-sm font-normal tracking-normal text-muted-foreground">
            {t("branches.fact", {
              code: branch.code,
              state: branch.isActive ? t("branches.active") : t("branches.inactive"),
            })}
          </span>
        </h1>
        <BranchActiveButton branch={branch} />
      </div>
      <BranchForm branch={branch} />
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
        <h2 className="text-subheading font-semibold">{t("branches.history")}</h2>
        <ChangeHistory entries={history.rows} fields={FIELDS} />
      </section>
    </div>
  );
}
