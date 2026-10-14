import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { listBranchChoices } from "@/features/users/queries/users";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { CatalogForm } from "../../catalog-form";

// /catalog/departments/new (build-plan 1.6; plan of 1.6, decision 2: a page, not the side panel).
// The branches offered are the active ones, read under catalog.manage, so a role without "Manage
// catalogs …" gets "not found" (03 rule 1; decision 3).

export default async function NewDepartmentPage() {
  const user = await requireUser("/catalog/departments/new");
  const choices = await readOrNotFound(() => listBranchChoices(user.id));
  const branches = choices.map(({ id, code, name }) => ({ id, code, name }));
  const t = await getTranslations("catalog");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href="/catalog/departments"
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("kinds.departments.title")}
      </Link>
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
        {t("kinds.departments.newTitle")}
      </h1>
      <CatalogForm kind="departments" entry={null} branches={branches} />
    </div>
  );
}
