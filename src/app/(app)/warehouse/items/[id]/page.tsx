import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { LowLabel, ReversedLabel } from "@/components/status-label";
import { plainQuantity } from "@/domain/drafts";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice, listMyBranches } from "@/features/catalog/queries/my-branches";
import { AddToDraftButton } from "@/features/warehouse/components/add-to-draft-button";
import { MinimumButton } from "@/features/warehouse/components/minimum-button";
import { ReverseDocumentButton } from "@/features/warehouse/components/reverse-document-button";
import { type ItemCard, getItemCard } from "@/features/warehouse/queries/item-card";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../../catalog/page-links";
import { setStockMinimumAction } from "./actions";

// /warehouse/items/[id], the item card (09-warehouse.md, Stock screens: Item card; 11-screens-
// and-ux.md, Screens: every role; rules 5 and 8; plan of 5.3): every movement of one subtype in
// one branch, newest first, with its running balance and its source. `[id]` is the subtype; the
// branch is the address's `branch=`, else the top bar's choice as /warehouse/stock reads it, else
// the user's only branch; otherwise, and for another branch, an unknown id or a service, the "Not
// found" page (decided item 3; 03 rule 1; 15 S7). A purchase's movement links to its order's
// Purchases tab (decided item 5); a document's number links to its page (decided item 4, Look
// first; plan of 5.12, decided item 3). A reversed document's number carries the "Reversed" label, and a row the server offers
// it on (`canReverse`) has the Reverse button (plan of 5.7). At phone width the table scrolls
// inside its panel, as Stock on hand. The header shows the minimum beside "On hand" with its
// pencil, "Low", and "Add to draft" where the query offers them (plan of 5.10).

const pageParam = z.coerce.number().int().min(1).catch(1);
const idParam = z.uuid().catch("");

type Params = { page?: string | string[]; branch?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The card, or the "Not found" page for a branch the user does not see. */
async function readCard(userId: string, variantId: string, branchId: string, page: number) {
  let card: ItemCard | null;
  try {
    card = await getItemCard(userId, variantId, branchId, page);
  } catch (error) {
    if (error instanceof AuthorizationError && error.kind === "not_found") notFound();
    throw error;
  }
  if (!card) notFound();
  return card;
}

export default async function ItemCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  const user = await requireUser(`/warehouse/items/${encodeURIComponent(id)}`);
  const raw = await searchParams;
  const addressBranch = idParam.parse(first(raw.branch) ?? "");
  let branch =
    addressBranch ||
    (await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value));
  if (!branch) {
    const mine = await listMyBranches(user.id);
    if (mine.length !== 1) notFound();
    branch = mine[0]!.id;
  }
  const card = await readCard(user.id, id, branch, pageParam.parse(first(raw.page)));
  const t = await getTranslations("warehouse.item");
  const format = await getFormatters();
  const href = (to: number) => {
    const query = new URLSearchParams({ branch: card.branchId });
    if (to > 1) query.set("page", String(to));
    return `/warehouse/items/${card.variantId}?${query.toString()}`;
  };
  const itemName = card.subtypeName ? `${card.productName}, ${card.subtypeName}` : card.productName;
  const change = (delta: string) =>
    delta.startsWith("-") ? format.quantity(delta) : `+${format.quantity(delta)}`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/warehouse/stock?branch=${card.branchId}`}
          className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm font-semibold text-link sm:min-h-0"
        >
          <Icon name="arrow_back" size={18} />
          {t("back")}
        </Link>
        <h1 className="text-title">
          {card.productName}
        </h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {card.subtypeName !== null && (
            <div className="flex gap-1">
              <dt className="text-muted-foreground">{t("subtype")}</dt>
              <dd className="font-semibold">{card.subtypeName}</dd>
            </div>
          )}
          <div className="flex gap-1">
            <dt className="text-muted-foreground">{t("branch")}</dt>
            <dd className="font-semibold" title={card.branchName}>
              {card.branchCode}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted-foreground">{t("onHand")}</dt>
            <dd className="inline-flex items-center gap-2 font-semibold tabular-nums">
              <span>
                {format.quantity(card.quantity)}{" "}
                <span title={card.unitName}>{card.unitShortName}</span>
              </span>
              {card.low && <LowLabel />}
            </dd>
          </div>
          {/* The minimum beside "On hand" (plan of 5.10; progress of 5.3). */}
          <div className="flex items-center gap-1">
            <dt className="text-muted-foreground">{t("minimum")}</dt>
            <dd className="inline-flex items-center gap-1 font-semibold tabular-nums" data-minimum>
              {card.minimum === null ? "—" : format.quantity(card.minimum)}
              {card.canSetMinimum && (
                <MinimumButton
                  branchId={card.branchId}
                  variantId={card.variantId}
                  itemName={itemName}
                  minimum={card.minimum === null ? "" : plainQuantity(card.minimum)}
                  unitShortName={card.unitShortName}
                  save={setStockMinimumAction}
                />
              )}
            </dd>
          </div>
        </dl>
        {card.low && card.canAddDraft && (
          <div className="max-sm:[&>*]:w-full">
            <AddToDraftButton
              branchId={card.branchId}
              variantId={card.variantId}
              itemName={itemName}
              unitShortName={card.unitShortName}
            />
          </div>
        )}
      </div>

      {card.found === 0 ? (
        <EmptyState title={t("emptyTitle")} line={t("emptyText")} />
      ) : (
        <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm leading-5">
            <caption className="sr-only">{t("summary", { count: card.found })}</caption>
            <thead className="bg-muted text-small font-semibold text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t("columns.moment")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("columns.movement")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("columns.source")}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t("columns.change")}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t("columns.balance")}
                </th>
                <th scope="col" className="relative px-4 py-3">
                  <span className="sr-only">{t("columns.action")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {card.movements.map((movement) => (
                <tr key={movement.id} className="border-t">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {format.date(movement.at)} {format.time(movement.at)}
                  </td>
                  <td className="px-4 py-3">{t(`types.${movement.type}`)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {movement.order ? (
                      <Link
                        href={`/orders/${movement.order.id}?tab=purchases`}
                        className="font-semibold text-link underline-offset-2 hover:underline"
                      >
                        {t("order", { number: movement.order.number })}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {movement.documentId && movement.documentNumber ? (
                          // The document's own page (plan of 5.12, decided item 3, Look first).
                          <Link
                            href={`/warehouse/documents/${movement.documentId}`}
                            className="font-semibold text-link underline-offset-2 hover:underline"
                          >
                            {movement.documentNumber}
                          </Link>
                        ) : (
                          t("noSource")
                        )}
                        {movement.documentStatus === "REVERSED" && <ReversedLabel />}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {change(movement.qtyDelta)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                    {format.quantity(movement.balanceAfter)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {movement.canReverse && movement.documentId && movement.documentNumber && (
                      <ReverseDocumentButton
                        documentId={movement.documentId}
                        number={movement.documentNumber}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {card.pages > 1 && <PageLinks page={card.page} pages={card.pages} href={href} />}
    </div>
  );
}
