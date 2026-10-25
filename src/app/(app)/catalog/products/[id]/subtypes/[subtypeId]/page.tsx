import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { Icon } from "@/components/icon";
import { SUBTYPES } from "@/domain/catalogs";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { getSubtype, listSubtypes } from "@/features/catalog/queries/subtypes";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../../../branches/read-or-not-found";
import { CatalogActiveButton } from "../../../../catalog-active-button";
import { PriceHistoryLink } from "../../../../../prices/price-history-link";
import { SubtypeForm } from "../../../subtype-form";

// /catalog/products/[id]/subtypes/[subtypeId] (build-plan 1.8): the subtype's form, its reference
// price as text (plan of 1.8, decision 2, Look first), Deactivate or Activate (04 rule 2), and its
// change history (04 rule 9), where the photo shows by its file name and the ids stay hidden, and
// a new price (1.9) by its price and note; a link opens its price page. The
// last active subtype of a product shows why it cannot be deactivated (decision 3, Look first);
// the server refuses it anyway. A default row, another product's subtype or an unknown id is "not
// found", as is any role without "Manage catalogs …" (03 rule 1).

const FIELDS: Record<string, HistoryField> = {
  productId: { label: "catalog.fields.productId", kind: "text", hidden: true },
  product: { label: "catalog.fields.productId", kind: "text" },
  name: { label: "catalog.fields.name", kind: "text" },
  referencePrice: { label: "catalog.fields.referencePrice", kind: "money" },
  photoFileId: { label: "catalog.fields.photoFileId", kind: "text", hidden: true },
  photo: { label: "catalog.fields.photoFileId", kind: "text" },
  isActive: { label: "catalog.fields.isActive", kind: "boolean" },
  checked: { label: "catalog.fields.checked", kind: "boolean" },
  fromDefault: { label: "catalog.fields.fromDefault", kind: "boolean" },
  note: { label: "catalog.fields.note", kind: "text" },
};

export default async function SubtypePage({
  params,
}: {
  params: Promise<{ id: string; subtypeId: string }>;
}) {
  const { id, subtypeId } = await params;
  const user = await requireUser(`/catalog/products/${id}/subtypes/${subtypeId}`);
  const subtype = await readOrNotFound(() => getSubtype(user.id, id, subtypeId));
  if (!subtype) notFound();
  const siblings = await listSubtypes(user.id, subtype.productId);
  const lastActive =
    subtype.isActive && !siblings.some((row) => row.id !== subtype.id && row.isActive);
  const t = await getTranslations("catalog");
  const format = await getFormatters();
  const history = await listChangeHistory(user.id, {
    entity: SUBTYPES.entity,
    entityId: subtype.id,
  });

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href={`/catalog/products/${subtype.productId}`}
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {subtype.productName}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {subtype.name}
          <span className="text-sm font-normal tracking-normal text-muted-foreground">
            {subtype.isActive ? t("active") : t("inactive")}
          </span>
        </h1>
        {lastActive ? (
          <p className="text-sm leading-5 text-muted-foreground sm:max-w-72">
            {t("subtypes.lastActive")}
          </p>
        ) : (
          <CatalogActiveButton
            kind="subtypes"
            entry={{ id: subtype.id, name: subtype.name, isActive: subtype.isActive }}
          />
        )}
      </div>
      <SubtypeForm
        productId={subtype.productId}
        entry={{ id: subtype.id, name: subtype.name, photoFileId: subtype.photoFileId }}
        price={subtype.referencePrice === null ? null : format.money(subtype.referencePrice)}
        priceLocked
        productPhotoFileId={subtype.productPhotoFileId}
      />
      <PriceHistoryLink variantId={subtype.id} />
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
        <h2 className="text-subheading font-semibold">{t("history")}</h2>
        <ChangeHistory entries={history.rows} fields={FIELDS} />
      </section>
    </div>
  );
}
