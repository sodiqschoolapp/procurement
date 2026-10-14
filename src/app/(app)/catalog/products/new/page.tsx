import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { listProductChoices } from "@/features/catalog/queries/products";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { ProductForm } from "../product-form";

// /catalog/products/new (build-plan 1.7; plan of 1.7, decision 4: a page, not the side panel). The
// choices are the active categories, measures and companies, read under catalog.manage, so a role
// without "Manage catalogs …" gets "not found" (03 rule 1).

export default async function NewProductPage() {
  const user = await requireUser("/catalog/products/new");
  const choices = await readOrNotFound(() => listProductChoices(user.id));
  const t = await getTranslations("catalog");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href="/catalog/products"
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("kinds.products.title")}
      </Link>
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
        {t("kinds.products.newTitle")}
      </h1>
      <ProductForm entry={null} choices={choices} />
    </div>
  );
}
