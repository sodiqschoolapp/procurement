import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { Icon } from "@/components/icon";
import { CATALOGS, type CatalogKind } from "@/domain/catalogs";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { getCatalogEntry } from "@/features/catalog/queries/catalog-entries";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { CatalogActiveButton } from "../../catalog-active-button";
import { CatalogForm } from "../../catalog-form";
import { kindOrNotFound } from "../kind";

// /catalog/<kind>/[id] (build-plan 1.5): the entry's form, Deactivate or Activate (04 rule 2),
// and its change history (04 rule 9). An unknown id, one that is not an id, or an entry of another
// catalog is "not found", as is any role without "Manage catalogs …" (03 rule 1).

function historyFields(kind: CatalogKind): Record<string, HistoryField> {
  const fields: Record<string, HistoryField> = {};
  for (const field of CATALOGS[kind].fields) {
    fields[field.key] = {
      label: `catalog.fields.${field.key}`,
      kind:
        field.type === "boolean"
          ? "boolean"
          : field.type === "companyKind"
            ? { enum: "catalog.companyKind" }
            : "text",
    } as HistoryField;
  }
  fields.isActive = { label: "catalog.fields.isActive", kind: "boolean" };
  return fields;
}

export default async function CatalogEntryPage({
  params,
}: {
  params: Promise<{ catalog: string; id: string }>;
}) {
  const { catalog, id } = await params;
  const kind = kindOrNotFound(catalog);
  const user = await requireUser(`/catalog/${kind}/${id}`);
  const entry = await readOrNotFound(() => getCatalogEntry(user.id, kind, id));
  if (!entry) notFound();
  const t = await getTranslations("catalog");
  const history = await listChangeHistory(user.id, {
    entity: CATALOGS[kind].entity,
    entityId: entry.id,
  });

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {entry.name}
          <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
            {entry.isActive ? t("active") : t("inactive")}
          </span>
        </h1>
        <CatalogActiveButton kind={kind} entry={entry} />
      </div>
      <CatalogForm kind={kind} entry={entry} />
      <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
        <h2 className="text-[17px] leading-6 font-bold">{t("history")}</h2>
        <ChangeHistory entries={history.rows} fields={historyFields(kind)} />
      </section>
    </div>
  );
}
