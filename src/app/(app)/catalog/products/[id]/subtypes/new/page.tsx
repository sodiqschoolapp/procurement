import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { getProduct } from "@/features/catalog/queries/products";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../../../branches/read-or-not-found";
import { SubtypeForm } from "../../../subtype-form";

// /catalog/products/[id]/subtypes/new (build-plan 1.8; plan of 1.8, decision 11: a page, not the
// side panel). For a product without subtypes a note asks the Head to name the existing items too:
// they keep their stock, orders and price under that name, and the new subtype is a new row (04
// rule 1; D64, replacing decisions 1.8 item 1). An inactive product takes no new subtype (decision 5):
// the page is "not found" for it, as for an unknown product or a role without "Manage catalogs …".

export default async function NewSubtypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/catalog/products/${id}/subtypes/new`);
  const product = await readOrNotFound(() => getProduct(user.id, id));
  if (!product || !product.isActive) notFound();
  const t = await getTranslations("catalog");
  const first = !product.hasVariants;

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href={`/catalog/products/${product.id}`}
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {product.name}
      </Link>
      <h1 className="text-title">{t("subtypes.newTitle", { product: product.name })}</h1>
      {first && (
        <p className="flex gap-2 rounded-xl bg-muted p-4 text-sm">
          <Icon name="info" />
          {t("subtypes.firstNote")}
        </p>
      )}
      <SubtypeForm
        productId={product.id}
        entry={null}
        price={null}
        first={first}
        productPhotoFileId={product.photoFileId}
      />
    </div>
  );
}
