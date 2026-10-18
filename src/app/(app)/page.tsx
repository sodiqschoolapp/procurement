import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { LowLabel, RequestStatusLabel } from "@/components/status-label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { GroupLines } from "@/features/home/components/group-lines";
import { HomeBlock } from "@/features/home/components/home-block";
import { WaitingCards } from "@/features/home/components/waiting-cards";
import { getManagerHome } from "@/features/home/queries/manager-home";
import { getPrincipalHome } from "@/features/home/queries/principal-home";
import { type ListFilters, listFiltersParams } from "@/features/orders/list-filters";
import { wireGroup } from "@/features/orders/list-wire";
import { listStockOnHand } from "@/features/warehouse/queries/stock-on-hand";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

// Home, "My tasks" (11-screens-and-ux.md, Screens and Interface per role; 10-notifications-
// analytics-reports.md, Home page per role; plan of 6.1). The Manager: three large buttons, then
// sent back to me, my drafts, my open orders with progress, requested in every stage, cash I hold,
// low stock and orders due soon. The Principal: the waiting group rows as large cards, then the
// branch's orders by status and its spending this month. Every list follows the top bar's branch
// (decided item 7) and links to the filtered order list; every number is the server's. The Head
// and Finance keep the empty state until 6.2. A Manager keeps the way in to the product
// suggestions beside the three buttons (plan of 1.12, decision 4, Look first).

/** The order list behind a home list; without `branch=` the list follows the top bar too. */
function listHref(filters: ListFilters): string {
  const query = listFiltersParams({ ...filters, branch: null }).toString();
  return `/orders${query ? `?${query}` : ""}`;
}

export default async function HomePage() {
  const user = await requireUser("/");
  const t = await getTranslations("home");
  const branch = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);

  const title = (
    <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
  );

  if (user.role === "MANAGER") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {title}
        <Suspense fallback={<HomeLoading />}>
          <ManagerHome userId={user.id} branch={branch} />
        </Suspense>
      </div>
    );
  }
  if (user.role === "PRINCIPAL") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {title}
        <Suspense fallback={<HomeLoading />}>
          <PrincipalHome userId={user.id} branch={branch} />
        </Suspense>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {title}
      <EmptyState title={t(`empty.${user.role}.title`)} line={t(`empty.${user.role}.line`)} />
    </div>
  );
}

/** Grey panels in the shape of the home lists while they load (11-screens-and-ux.md rule 5). */
function HomeLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full bg-secondary sm:w-48" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-48 w-full bg-card" />
        ))}
      </div>
    </div>
  );
}

async function ManagerHome({ userId, branch }: { userId: string; branch: string | null }) {
  const t = await getTranslations("home");
  const format = await getFormatters();
  const home = await getManagerHome(userId, branch);
  const low = await listStockOnHand(userId, { branch, low: true });
  const showAll = (count: number, filters: ListFilters) => ({
    href: listHref(filters),
    label: t("showAll", { count }),
  });

  return (
    <>
      {/* 11 Interface per role: three large buttons; "New order" primary (design system, Home buttons). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {home.buttons.newOrder && (
          <Link
            href="/orders#drafts-title"
            data-home-button="newOrder"
            className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
          >
            {t("manager.buttons.newOrder")}
          </Link>
        )}
        {home.buttons.recordPurchase && (
          <Link
            href={listHref(home.filters.open)}
            data-home-button="recordPurchase"
            className={buttonVariants({
              size: "lg",
              variant: "secondary",
              className: "w-full sm:w-auto",
            })}
          >
            {t("manager.buttons.recordPurchase")}
          </Link>
        )}
        {home.buttons.issue && (
          <Link
            href="/warehouse/documents/new?type=ISSUE"
            data-home-button="issue"
            className={buttonVariants({
              size: "lg",
              variant: "secondary",
              className: "w-full sm:w-auto",
            })}
          >
            {t("manager.buttons.issue")}
          </Link>
        )}
        <Link
          href="/suggestions"
          className="inline-flex min-h-11 items-center self-start text-sm font-semibold underline-offset-2 hover:underline sm:self-center"
        >
          {t("suggest")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HomeBlock
          id="sent-back"
          title={t("manager.sentBack.title")}
          count={home.sentBack.total}
          empty={home.sentBack.total === 0 ? t("manager.sentBack.empty") : null}
          link={showAll(home.sentBack.total, home.filters.sentBack)}
        >
          <GroupLines groups={home.sentBack.groups.map(wireGroup)} />
        </HomeBlock>

        <HomeBlock
          id="drafts"
          title={t("manager.drafts.title")}
          count={home.drafts}
          empty={home.drafts === 0 ? t("manager.drafts.empty") : null}
          link={{ href: "/orders#drafts-title", label: t("manager.drafts.open") }}
        >
          <p className="text-[15px] leading-[22px]">
            {t("manager.drafts.count", { count: home.drafts })}
          </p>
        </HomeBlock>

        <HomeBlock
          id="open"
          title={t("manager.open.title")}
          count={home.open.total}
          empty={home.open.total === 0 ? t("manager.open.empty") : null}
          link={showAll(home.open.total, home.filters.open)}
        >
          <GroupLines groups={home.open.groups.map(wireGroup)} progress={home.openProgress} />
        </HomeBlock>

        <HomeBlock
          id="requested"
          title={t("manager.requested.title")}
          empty={home.requested.length === 0 ? t("manager.requested.empty") : null}
          link={{ href: listHref(home.filters.mine), label: t("openList") }}
        >
          <ul className="flex flex-col gap-2 text-[15px] leading-[22px]">
            {home.requested.map((line) => (
              <li key={line.variantId} data-home-requested={line.variantId}>
                {t("manager.requested.line", {
                  product: line.subtypeName
                    ? `${line.productName}, ${line.subtypeName}`
                    : line.productName,
                  quantity: format.quantity(line.quantity),
                  unit: line.unitShortName,
                })}
              </li>
            ))}
          </ul>
        </HomeBlock>

        <HomeBlock
          id="cash"
          title={t("manager.cash.title")}
          link={{ href: listHref(home.filters.mine), label: t("openList") }}
        >
          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-[13px] leading-4 text-muted-foreground">
                {t("manager.cash.held")}
              </dt>
              <dd data-cash="held" className="text-[20px] leading-7 font-bold tabular-nums">
                {format.money(home.cash.held)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-[13px] leading-4 text-muted-foreground">
                {t("manager.cash.owed")}
              </dt>
              <dd data-cash="owed" className="text-[20px] leading-7 font-bold tabular-nums">
                {format.money(home.cash.owed)}
              </dd>
            </div>
          </dl>
          <p className="text-[13px] leading-4 text-muted-foreground">
            {t("manager.cash.orders", { count: home.cash.orders })}
          </p>
        </HomeBlock>

        <HomeBlock
          id="low"
          title={t("manager.low.title")}
          count={low.found}
          empty={low.found === 0 ? t("manager.low.empty") : null}
          link={{ href: "/warehouse/stock?low=1", label: t("showAll", { count: low.found }) }}
        >
          <ul className="flex flex-col divide-y divide-border">
            {low.rows.slice(0, 5).map((row) => (
              <li
                key={`${row.branchId}:${row.variantId}`}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <Link
                  href={`/warehouse/items/${row.variantId}?branch=${row.branchId}`}
                  className="text-[15px] leading-[22px] font-semibold underline-offset-2 hover:underline"
                >
                  {row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName}{" "}
                  <span className="text-[13px] font-normal text-muted-foreground">
                    {row.branchCode}
                  </span>
                </Link>
                <span className="flex items-center gap-2 text-[13px] leading-4 tabular-nums">
                  {t("manager.low.row", {
                    quantity: format.quantity(row.quantity),
                    unit: row.unitShortName,
                    minimum: format.quantity(row.minimum ?? "0"),
                  })}
                  <LowLabel />
                </span>
              </li>
            ))}
          </ul>
        </HomeBlock>

        <HomeBlock
          id="due-soon"
          title={t("manager.dueSoon.title")}
          count={home.dueSoon.total}
          empty={home.dueSoon.total === 0 ? t("manager.dueSoon.empty") : null}
          link={showAll(home.dueSoon.total, home.filters.dueSoon)}
          className={cn("lg:col-span-2")}
        >
          <p className="text-[13px] leading-4 text-muted-foreground">{t("manager.dueSoon.hint")}</p>
          <GroupLines groups={home.dueSoon.groups.map(wireGroup)} />
        </HomeBlock>
      </div>
    </>
  );
}

async function PrincipalHome({ userId, branch }: { userId: string; branch: string | null }) {
  const t = await getTranslations("home");
  const format = await getFormatters();
  const home = await getPrincipalHome(userId, branch);
  const waitingHref = listHref(home.waitingFilters);

  return (
    <>
      <HomeBlock
        id="waiting"
        title={t("principal.waiting.title")}
        count={home.waiting.count}
        empty={home.waiting.count === 0 ? t("principal.waiting.empty") : null}
        link={{ href: waitingHref, label: t("showAll", { count: home.waiting.count }) }}
      >
        <p data-waiting-total className="text-[20px] leading-7 font-bold tabular-nums">
          {t("principal.waiting.total", {
            count: home.waiting.count,
            total: format.money(home.waiting.totals.grand),
          })}
        </p>
      </HomeBlock>
      {home.cards.length > 0 && (
        <WaitingCards
          cards={home.cards.map((card) => ({ group: wireGroup(card.group), moves: card.moves }))}
          listHref={waitingHref}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <HomeBlock
          id="by-status"
          title={t("principal.byStatus.title")}
          empty={home.byStatus.length === 0 ? t("principal.byStatus.empty") : null}
        >
          <ul className="flex flex-col divide-y divide-border">
            {home.byStatus.map((row) => (
              <li key={row.status}>
                <Link
                  href={listHref({ ...home.waitingFilters, status: row.status })}
                  data-status-count={row.status}
                  className="flex min-h-11 items-center justify-between gap-3 py-2"
                >
                  <RequestStatusLabel status={row.status} />
                  <span className="text-[15px] leading-[22px] font-semibold tabular-nums">
                    {row.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </HomeBlock>

        <HomeBlock id="spending" title={t("principal.spending.title")}>
          <p data-spending className="text-[28px] leading-[34px] font-bold tabular-nums">
            {format.money(home.spending)}
          </p>
          <p className="text-[13px] leading-4 text-muted-foreground">
            {t("principal.spending.period", {
              from: format.date(home.month.first),
              to: format.date(home.month.last),
            })}
          </p>
          <p className="text-[13px] leading-4 text-muted-foreground">
            {t("principal.spending.hint")}
          </p>
        </HomeBlock>
      </div>
    </>
  );
}
