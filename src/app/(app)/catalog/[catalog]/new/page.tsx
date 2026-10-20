import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { countActiveCatalogEntries } from "@/features/catalog/queries/catalog-entries";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { CatalogForm } from "../../catalog-form";
import { kindOrNotFound } from "../kind";

// /catalog/<kind>/new (build-plan 1.5; plan of 1.5, decision 1: a page, not the side panel). A
// query under catalog.manage runs first, so a role without "Manage catalogs …" gets "not found"
// (03 rule 1).

export default async function NewCatalogEntryPage({
  params,
}: {
  params: Promise<{ catalog: string }>;
}) {
  const kind = kindOrNotFound((await params).catalog);
  const user = await requireUser(`/catalog/${kind}/new`);
  await readOrNotFound(() => countActiveCatalogEntries(user.id));
  const t = await getTranslations("catalog");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href={`/catalog/${kind}`}
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t(`kinds.${kind}.title`)}
      </Link>
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
        {t(`kinds.${kind}.newTitle`)}
      </h1>
      <CatalogForm kind={kind} entry={null} />
    </div>
  );
}
