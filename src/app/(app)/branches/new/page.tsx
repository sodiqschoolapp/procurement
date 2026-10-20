import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin-nav";
import { listBranches } from "@/features/catalog/queries/branches";
import { requireUser } from "@/server/auth/session";

import { BranchForm } from "../branch-form";
import { readOrNotFound } from "../read-or-not-found";

// /branches/new (build-plan 1.2; plan of 1.2, decision 4: a page, not the side panel). The query
// asks authorize() first, so a role without "Manage … branches" gets "not found" (03 rule 1).

export default async function NewBranchPage() {
  const user = await requireUser("/branches/new");
  await readOrNotFound(() => listBranches(user.id));
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AdminNav current="branches" />
      <h1 className="text-title">
        {t("branches.newTitle")}
      </h1>
      <BranchForm branch={null} />
    </div>
  );
}
