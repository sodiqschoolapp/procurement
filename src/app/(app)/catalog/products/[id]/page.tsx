import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { Icon } from "@/components/icon";
import { PRODUCTS, SUBTYPES } from "@/domain/catalogs";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { getProduct, listProductChoices } from "@/features/catalog/queries/products";
import { listSubtypes } from "@/features/catalog/queries/subtypes";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { CatalogActiveButton } from "../../catalog-active-button";
import { PriceHistoryLink } from "../../../prices/price-history-link";
import { ProductForm } from "../product-form";
import { SubtypeList } from "../subtype-list";

// /catalog/products/[id] (build-plan 1.7): the product's form, Deactivate or Activate (04 rule 2),
// and its change history (04 rule 9), where category, measure and company show by their names as
// they were then and the ids stay hidden (plan of 1.7, decision 11). The reference price is shown,
// not edited (decision 2); from 1.8 it is the hidden default subtype's, and a product with
// subtypes says its prices are per subtype (plan of 1.8, decisions 2 and 4, Look first). The
// Subtypes section lists the real subtypes (1.8). A product without subtypes links to its default's
// price page, and its history shows that default's new prices (plan of 1.9). An unknown id, or one that is not an id, is "not found", as is any role
// without "Manage catalogs …" (03 rule 1).

const FIELDS: Record<string, HistoryField> = {
  name: { label: "catalog.fields.name", kind: "text" },
  type: { label: "catalog.fields.type", kind: { enum: "catalog.productType" } },
  categoryId: { label: "catalog.fields.categoryId", kind: "text", hidden: true },
  category: { label: "catalog.fields.categoryId", kind: "text" },
  unitId: { label: "catalog.fields.unitId", kind: "text", hidden: true },
  unit: { label: "catalog.fields.unitId", kind: "text" },
  defaultCompanyId: { label: "catalog.fields.defaultCompanyId", kind: "text", hidden: true },
  defaultCompany: { label: "catalog.fields.defaultCompanyId", kind: "text" },
  referencePrice: { label: "catalog.fields.referencePrice", kind: "money" },
  description: { label: "catalog.fields.description", kind: "text" },
  photoFileId: { label: "catalog.fields.photoFileId", kind: "text", hidden: true },
  photo: { label: "catalog.fields.photoFileId", kind: "text" },
  isActive: { label: "catalog.fields.isActive", kind: "boolean" },
  note: { label: "catalog.fields.note", kind: "text" },
  productId: { label: "catalog.fields.productId", kind: "text", hidden: true },
  product: { label: "catalog.fields.productId", kind: "text" },
  hasVariants: { label: "catalog.fields.hasVariants", kind: "boolean" },
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/catalog/products/${id}`);
  const product = await readOrNotFound(() => getProduct(user.id, id));
  if (!product) notFound();
  const choices = await listProductChoices(user.id, product);
  const subtypes = await listSubtypes(user.id, product.id);
  const t = await getTranslations("catalog");
  const format = await getFormatters();
  // A product without subtypes also shows the new prices of its hidden default (04 rule 9; plan
  // review of 1.9, Should fix 5).
  const history = await listChangeHistory(user.id, {
    entity: PRODUCTS.entity,
    entityId: product.id,
    ...(product.defaultVariantId
      ? { also: { entity: SUBTYPES.entity, entityId: product.defaultVariantId } }
      : {}),
  });
  const entry = {
    id: product.id,
    name: product.name,
    type: product.type,
    categoryId: product.categoryId,
    unitId: product.unitId,
    defaultCompanyId: product.defaultCompanyId,
    description: product.description,
    photoFileId: product.photoFileId,
    inUse: product.inUse,
  };

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href="/catalog/products"
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("kinds.products.title")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {product.name}
          <span className="text-sm font-normal tracking-normal text-muted-foreground">
            {product.isActive ? t("active") : t("inactive")}
          </span>
        </h1>
        <CatalogActiveButton
          kind="products"
          entry={{ id: product.id, name: product.name, isActive: product.isActive }}
        />
      </div>
      <ProductForm
        entry={entry}
        choices={choices}
        price={
          product.hasVariants
            ? t("subtypes.pricePerSubtype")
            : product.referencePrice === null
              ? null
              : format.money(product.referencePrice)
        }
      />
      {product.defaultVariantId && <PriceHistoryLink variantId={product.defaultVariantId} />}
      <SubtypeList
        productId={product.id}
        productName={product.name}
        productPhotoFileId={product.photoFileId}
        productActive={product.isActive}
        rows={subtypes}
      />
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
        <h2 className="text-subheading font-semibold">{t("history")}</h2>
        <ChangeHistory entries={history.rows} fields={FIELDS} />
      </section>
    </div>
  );
}
