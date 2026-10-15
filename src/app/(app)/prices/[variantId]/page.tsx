import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as z from "zod";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { getPriceHistory } from "@/features/catalog/queries/prices";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { PageLinks } from "../../catalog/page-links";
import { PriceForm } from "../price-form";

// /prices/[variantId] (build-plan 1.9: "a price-history view per subtype"; 04-catalogs.md rule 4:
// "older prices stay in the price history"; rule 9: who and when). One subtype, the hidden default
// of a product without subtypes included (plan of 1.9, decision 5, Look first): its current price,
// the New price form, and every price newest first with source, note, who and when (Tashkent time,
// decision 13), 25 a page. The back link goes to the subtype's page, or to the product's for the
// default. Any role but the Head, or an unknown id: "not found" (03 rule 1).

const pageParam = z.coerce.number().int().min(1).catch(1);

type Params = { page?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function PriceHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ variantId: string }>;
  searchParams: Promise<Params>;
}) {
  const { variantId } = await params;
  const user = await requireUser(`/prices/${variantId}`);
  const asked = pageParam.parse(first((await searchParams).page));
  const found = await readOrNotFound(() => getPriceHistory(user.id, variantId, { page: asked }));
  if (!found) notFound();
  const t = await getTranslations("prices");
  const tCatalog = await getTranslations("catalog");
  const format = await getFormatters();
  const back =
    found.subtypeName === null
      ? `/catalog/products/${found.productId}`
      : `/catalog/products/${found.productId}/subtypes/${found.variantId}`;
  const href = (to: number) => `/prices/${found.variantId}${to > 1 ? `?page=${to}` : ""}`;
  const title =
    found.subtypeName === null ? found.productName : `${found.productName} · ${found.subtypeName}`;
  const when = (moment: Date) => `${format.date(moment)} ${format.time(moment)}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AdminNav current="prices" />
      <Link
        href={back}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {found.subtypeName ?? found.productName}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {title}
          {!found.isActive && (
            <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
              {tCatalog("inactive")}
            </span>
          )}
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground tabular-nums">
          {t("currentLine", {
            price:
              found.referencePrice === null ? t("noPrice") : format.money(found.referencePrice),
          })}
        </p>
      </div>

      <PriceForm variantId={found.variantId} />

      <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
        <h2 className="text-[17px] leading-6 font-bold">{t("historyTitle")}</h2>
        {found.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRows")}</p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm leading-5">
              <thead className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-2 text-right">
                    {t("price")}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t("source")}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t("note")}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t("who")}
                  </th>
                  <th scope="col" className="px-6 py-2">
                    {t("when")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {found.rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-6 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                      {format.money(row.price)}
                    </td>
                    <td className="px-3 py-3">{t(`sources.${row.source}`)}</td>
                    <td className="px-3 py-3">{row.note}</td>
                    <td className="px-3 py-3">{row.setByName}</td>
                    <td className="px-6 py-3 whitespace-nowrap tabular-nums">
                      {when(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {found.pages > 1 && <PageLinks page={found.page} pages={found.pages} href={href} />}
    </div>
  );
}
