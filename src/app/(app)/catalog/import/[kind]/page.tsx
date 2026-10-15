import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { IMPORT_COLUMNS, IMPORT_PERMISSIONS, isImportKind } from "@/domain/imports";
import { requireUser } from "@/server/auth/session";
import { authorize } from "@/server/authorize";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { ImportForm } from "./import-form";

// /catalog/import/products, /departments and /prices (build-plans 1.10 and 1.11; 04-catalogs.md
// rule 7; plan of 1.10, "Screens" and decision 4, Look first: a page of its own, not a dialog).
// Three sections with plain headings: the template, the file, the preview. The page checks the
// kind's own permission, the one its template, preview and save check (plan of 1.11, decision 4,
// Look first; plan review, Should fix 3), so anyone else gets "not found" (03 rule 1). The prices
// import lives under Prices: its back link and the Admin nav lead there (decision 10).

const LISTS = {
  products: "/catalog/products",
  departments: "/catalog/departments",
  prices: "/prices",
} as const;

export default async function ImportPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isImportKind(kind)) notFound();
  const user = await requireUser(`/catalog/import/${kind}`);
  await readOrNotFound(() => authorize(user.id, IMPORT_PERMISSIONS[kind]));
  const t = await getTranslations("imports");
  const tCatalog = await getTranslations("catalog");
  const tPrices = await getTranslations("prices");
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <AdminNav current={kind === "prices" ? "prices" : "catalog"} />
      <Link
        href={LISTS[kind]}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {kind === "prices" ? tPrices("title") : tCatalog(`kinds.${kind}.title`)}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t(`title.${kind}`)}
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          {t(`description.${kind}`)}
        </p>
      </div>
      <ImportForm
        kind={kind}
        columns={
          kind === "products"
            ? IMPORT_COLUMNS.products.map((column) => t(`columns.products.${column}`))
            : kind === "departments"
              ? IMPORT_COLUMNS.departments.map((column) => t(`columns.departments.${column}`))
              : IMPORT_COLUMNS.prices.map((column) => t(`columns.prices.${column}`))
        }
        listHref={LISTS[kind]}
      />
    </div>
  );
}
