import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { IMPORT_COLUMNS, isImportKind } from "@/domain/imports";
import { authorizeImportKind } from "@/features/catalog/imports/permission";
import { directEntryBranchChoices } from "@/features/warehouse/queries/direct-entry-form";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { ImportForm } from "./import-form";

// /catalog/import/products, /departments, /prices and /stock (build-plans 1.10, 1.11 and 5.9;
// 04-catalogs.md rule 7; plan of 1.10, "Screens" and decision 4, Look first: a page of its own,
// not a dialog). Three sections with plain headings: the template, the file, the preview. The page
// checks the kind's own permission, the one its template, preview and save check (plan of 1.11,
// decision 4, Look first; plan review, Should fix 3), so anyone else gets "not found" (03 rule 1).
// The prices import lives under Prices: its back link and the Admin nav lead there (decision 10).
// Existing stock is a warehouse page (plan of 5.9, decided item 8): its back link leads to Stock on
// hand, it has no Admin nav, and its branch is chosen first (decided item 2, Look first).

const LISTS = {
  products: "/catalog/products",
  departments: "/catalog/departments",
  prices: "/prices",
  stock: "/warehouse/stock",
} as const;

export default async function ImportPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isImportKind(kind)) notFound();
  const user = await requireUser(`/catalog/import/${kind}`);
  await readOrNotFound(() => authorizeImportKind(user.id, kind));
  const t = await getTranslations("imports");
  const tCatalog = await getTranslations("catalog");
  const tPrices = await getTranslations("prices");
  const tStock = await getTranslations("warehouse.stock");
  const branches = kind === "stock" ? await directEntryBranchChoices(user.id) : undefined;
  const back =
    kind === "prices"
      ? tPrices("title")
      : kind === "stock"
        ? tStock("title")
        : tCatalog(`kinds.${kind}.title`);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {kind !== "stock" && <AdminNav current={kind === "prices" ? "prices" : "catalog"} />}
      <Link
        href={LISTS[kind]}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {back}
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
              : kind === "prices"
                ? IMPORT_COLUMNS.prices.map((column) => t(`columns.prices.${column}`))
                : IMPORT_COLUMNS.stock.map((column) => t(`columns.stock.${column}`))
        }
        listHref={LISTS[kind]}
        branches={branches}
        initialBranchId={branches?.length === 1 ? branches[0]!.id : ""}
      />
    </div>
  );
}
