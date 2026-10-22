import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { RowLinks } from "@/components/row-links";
import { buttonVariants } from "@/components/ui/button";
import type { SubtypeRow } from "@/features/catalog/queries/subtypes";
import { getFormatters } from "@/i18n/get-formatters";

// The Subtypes section of a product's page (build-plan 1.8; 04-catalogs.md, Catalogs table:
// Subtypes; rule 1). A product without subtypes shows none (build-plan 1.8, Done when: its hidden
// default row is never listed) and offers "Add subtype"; the first one added becomes the product's
// first subtype with what was recorded so far (plan of 1.8, decision 1, Look first). A subtype
// without its own photo shows the product's (decision 8), without its own price none (decision 4).
// At phone width each subtype is a card; from sm a table (11-screens-and-ux.md rule 12).

export async function SubtypeList({
  productId,
  productName,
  productPhotoFileId,
  productActive,
  rows,
}: {
  productId: string;
  productName: string;
  productPhotoFileId: string | null;
  productActive: boolean;
  rows: SubtypeRow[];
}) {
  const t = await getTranslations("catalog");
  const format = await getFormatters();
  const href = (id: string) => `/catalog/products/${productId}/subtypes/${id}`;
  const photo = (row: SubtypeRow) => {
    const file = row.photoFileId ?? productPhotoFileId;
    return file ? (
      // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
      <img
        src={`/files/${file}/small`}
        alt={t("photoAlt", { name: `${productName} ${row.name}` })}
        width={40}
        height={40}
        loading="lazy"
        className="size-10 shrink-0 rounded-lg bg-muted object-cover"
      />
    ) : (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name="inventory_2" size={18} label={t("noPhoto")} />
      </span>
    );
  };
  const price = (row: SubtypeRow) =>
    row.referencePrice === null ? t("noPrice") : format.money(row.referencePrice);

  return (
    <section
      aria-labelledby="subtypes-title"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="subtypes-title" className="text-subheading font-semibold">
          {t("subtypes.title")}
        </h2>
        {productActive && (
          <Link
            href={`/catalog/products/${productId}/subtypes/new`}
            className={buttonVariants({ variant: "secondary", className: "w-full sm:w-auto" })}
          >
            <Icon name="add" />
            {t("subtypes.new")}
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("subtypes.none")}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2 sm:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={href(row.id)}
                  className="flex min-h-11 items-center gap-3 rounded-lg border p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {photo(row)}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{row.name}</span>
                    <span className="text-sm leading-5 text-muted-foreground tabular-nums">
                      {t("subtypes.fact", {
                        price: price(row),
                        state: row.isActive ? t("active") : t("inactive"),
                      })}
                    </span>
                  </span>
                  <Icon name="chevron_right" />
                </Link>
              </li>
            ))}
          </ul>
          <RowLinks>
            <table className="table-cards hidden w-full border-collapse text-left text-sm leading-5 sm:table">
              <thead className="border-b border-border bg-muted text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="w-16 px-4 py-3">
                    <span className="sr-only">{t("fields.photoFileId")}</span>
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("fields.name")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {t("fields.referencePrice")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr data-row key={row.id} className="border-t hover:bg-accent/50">
                    <td data-card="head" className="px-4 py-2">
                      {photo(row)}
                    </td>
                    <td data-label={t("fields.name")} className="px-4 py-3 font-semibold">
                      <Link
                        data-row-link
                        href={href(row.id)}
                        className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td
                      data-label={t("fields.referencePrice")}
                      className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                    >
                      {price(row)}
                    </td>
                    <td data-label={t("status")} className="px-4 py-3">
                      {row.isActive ? t("active") : t("inactive")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RowLinks>
        </>
      )}
    </section>
  );
}
