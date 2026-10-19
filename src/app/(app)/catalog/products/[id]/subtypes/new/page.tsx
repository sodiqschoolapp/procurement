import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { getProduct } from "@/features/catalog/queries/products";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../../../branches/read-or-not-found";
import { SubtypeForm } from "../../../subtype-form";

// /catalog/products/[id]/subtypes/new (build-plan 1.8; plan of 1.8, decision 11: a page, not the
// side panel). For a product without subtypes a note says that this one becomes its first
// subtype and keeps what was recorded so far, and a price the hidden default holds is shown, not
// typed (decisions 1 and 2, Look first). An inactive product takes no new subtype (decision 5):
// the page is "not found" for it, as for an unknown product or a role without "Manage catalogs …".

export default async function NewSubtypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/catalog/products/${id}/subtypes/new`);
  const product = await readOrNotFound(() => getProduct(user.id, id));
  if (!product || !product.isActive) notFound();
  const t = await getTranslations("catalog");
  const format = await getFormatters();
  const first = !product.hasVariants;
  const held = first ? product.referencePrice : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href={`/catalog/products/${product.id}`}
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {product.name}
      </Link>
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
        {t("subtypes.newTitle", { product: product.name })}
      </h1>
      {first && (
        <p className="flex gap-2 rounded-xl bg-muted p-4 text-[15px] leading-[22px]">
          <Icon name="info" />
          {t("subtypes.firstNote")}
        </p>
      )}
      <SubtypeForm
        productId={product.id}
        entry={null}
        price={held === null ? null : format.money(held)}
        priceLocked={held !== null}
        productPhotoFileId={product.photoFileId}
      />
    </div>
  );
}
