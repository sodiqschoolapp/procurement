import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Skeleton } from "@/components/skeleton";
import { LowLabel, RequestStatusLabel } from "@/components/status-label";
import { buttonVariants } from "@/components/ui/button";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { GroupLines } from "@/features/home/components/group-lines";
import { HomeBlock } from "@/features/home/components/home-block";
import { OwnerEntries } from "@/features/home/components/owner-entries";
import { WaitingCards } from "@/features/home/components/waiting-cards";
import { getFinanceHome } from "@/features/home/queries/finance-home";
import { getHeadHome } from "@/features/home/queries/head-home";
import { getManagerHome } from "@/features/home/queries/manager-home";
import { getMoneyWithManagers } from "@/features/money/queries/money-with-managers";
import { getPricePrompts } from "@/features/catalog/queries/price-prompts";
import { countPendingSuggestions, listSuggestions } from "@/features/catalog/queries/suggestions";
import { getPrincipalHome } from "@/features/home/queries/principal-home";
import { type ListFilters, NO_FILTERS, listFiltersParams } from "@/features/orders/list-filters";
import { wireGroup } from "@/features/orders/list-wire";
import { listStockOnHand } from "@/features/warehouse/queries/stock-on-hand";
import type { WriteOffReason } from "@/domain/stock-documents";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

// Home, "My tasks" (11-screens-and-ux.md, Screens and Interface per role; 10-notifications-
// analytics-reports.md, Home page per role; plan of 6.1). The Manager: three large buttons, then
// sent back to me, my drafts, my open orders with progress, requested in every stage, cash I hold,
// low stock and orders due soon. The Principal: the waiting group rows as large cards, then the
// branch's orders by status and its spending this month. Every list follows the top bar's branch
// (decided item 7) and links to the filtered order list; every number is the server's. The Head
// and Finance get theirs in 6.2 (plan of 6.2): the Head every decision waiting across the
// branches, Finance its approvals and settlements by owner with the exact amount. A Manager keeps the way in to the product
// suggestions beside the three buttons (plan of 1.12, decision 4, Look first).

/** The order list behind a home list; without `branch=` the list follows the top bar too. */
const HOME_ROWS = 5;

/** The order list of exactly the filters, a chosen branch kept (the per-branch and owner links). */
function exactHref(filters: ListFilters): string {
  const query = listFiltersParams(filters).toString();
  return `/orders${query ? `?${query}` : ""}`;
}

function listHref(filters: ListFilters): string {
  const query = listFiltersParams({ ...filters, branch: null }).toString();
  return `/orders${query ? `?${query}` : ""}`;
}

export default async function HomePage() {
  const user = await requireUser("/");
  const t = await getTranslations("home");
  const branch = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);

  const title = <h1 className="text-title">{t("title")}</h1>;

  if (user.role === "MANAGER") {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        {title}
        <Suspense fallback={<HomeLoading />}>
          <ManagerHome userId={user.id} branch={branch} />
        </Suspense>
      </div>
    );
  }
  if (user.role === "HEAD" || user.role === "FINANCE") {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        {title}
        <Suspense fallback={<HomeLoading />}>
          {user.role === "HEAD" ? (
            <HeadHome userId={user.id} branch={branch} />
          ) : (
            <FinanceHome userId={user.id} branch={branch} />
          )}
        </Suspense>
      </div>
    );
  }
  // The Principal.
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {title}
      <Suspense fallback={<HomeLoading />}>
        <PrincipalHome userId={user.id} branch={branch} />
      </Suspense>
    </div>
  );
}

/** Grey panels in the shape of the home lists while they load (11-screens-and-ux.md rule 5). */
function HomeLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full sm:w-48" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-48 w-full" />
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
  // Nothing waits and nothing is held: one calm empty state instead of empty panels.
  const cashHeld = home.cash.held !== 0n || home.cash.owed !== 0n;
  const nothing =
    home.sentBack.total === 0 &&
    home.dueSoon.total === 0 &&
    home.open.total === 0 &&
    home.drafts === 0 &&
    low.found === 0 &&
    home.requested.length === 0 &&
    !cashHeld;
  const showAll = (count: number, filters: ListFilters) => ({
    href: listHref(filters),
    label: t("showAll", { count }),
  });

  return (
    <>
      {/* 11 Interface per role: three large buttons; "New order" primary (design system, Home buttons). */}
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
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
          className={buttonVariants({ variant: "ghost", className: "justify-self-start" })}
        >
          <Icon name="add" size={18} />
          {t("suggest")}
        </Link>
      </div>

      {nothing ? (
        <EmptyState icon="task_alt" title={t("allClear.title")} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <HomeBlock
            id="sent-back"
            now
            title={t("manager.sentBack.title")}
            count={home.sentBack.total}
            hidden={home.sentBack.total === 0}
            link={showAll(home.sentBack.total, home.filters.sentBack)}
          >
            <GroupLines
              groups={home.sentBack.groups.map(wireGroup)}
              listHref={listHref(home.filters.sentBack)}
            />
          </HomeBlock>
          <HomeBlock
            id="due-soon"
            now
            title={t("manager.dueSoon.title")}
            count={home.dueSoon.total}
            hidden={home.dueSoon.total === 0}
            link={showAll(home.dueSoon.total, home.filters.dueSoon)}
          >
            <GroupLines
              groups={home.dueSoon.groups.map(wireGroup)}
              listHref={listHref(home.filters.dueSoon)}
            />
          </HomeBlock>
          <HomeBlock
            id="open"
            title={t("manager.open.title")}
            count={home.open.total}
            hidden={home.open.total === 0}
            link={showAll(home.open.total, home.filters.open)}
          >
            <GroupLines
              groups={home.open.groups.map(wireGroup)}
              listHref={listHref(home.filters.open)}
              progress={home.openProgress}
            />
          </HomeBlock>
          <HomeBlock
            id="drafts"
            title={t("manager.drafts.title")}
            count={home.drafts}
            hidden={home.drafts === 0}
            link={{ href: "/orders#drafts-title", label: t("manager.drafts.open") }}
          >
            <p className="text-sm">{t("manager.drafts.count", { count: home.drafts })}</p>
          </HomeBlock>
          <HomeBlock
            id="cash"
            hidden={!cashHeld}
            title={t("manager.cash.title")}
            link={{ href: listHref(home.filters.mine), label: t("openList") }}
          >
            <dl className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{t("manager.cash.held")}</dt>
                <dd data-cash="held" className="text-heading font-semibold tabular-nums">
                  {format.money(home.cash.held)}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{t("manager.cash.owed")}</dt>
                <dd data-cash="owed" className="text-heading font-semibold tabular-nums">
                  {format.money(home.cash.owed)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {t("manager.cash.orders", { count: home.cash.orders })}
            </p>
          </HomeBlock>
          <HomeBlock
            id="low"
            title={t("manager.low.title")}
            count={low.found}
            hidden={low.found === 0}
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
                    className="text-sm font-semibold underline-offset-2 hover:underline"
                  >
                    {row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName}{" "}
                    <span className="text-small font-normal text-muted-foreground">
                      {row.branchCode}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2 text-xs tabular-nums">
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
            id="requested"
            title={t("manager.requested.title")}
            hidden={home.requested.length === 0}
            link={{ href: listHref(home.filters.mine), label: t("openList") }}
          >
            <ul className="flex flex-col gap-2 text-sm">
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
        </div>
      )}
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
      {home.waiting.count === 0 && <EmptyState icon="task_alt" title={t("allClear.title")} />}
      <HomeBlock
        id="waiting"
        now
        title={t("principal.waiting.title")}
        count={home.waiting.count}
        hidden={home.waiting.count === 0}
        link={{ href: waitingHref, label: t("showAll", { count: home.waiting.count }) }}
      >
        <p data-waiting-total className="text-figure font-semibold tabular-nums">
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
          financeStep={home.financeStep}
        />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <HomeBlock
          id="by-status"
          title={t("principal.byStatus.title")}
          hidden={home.byStatus.length === 0}
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
                  <span className="text-sm font-semibold tabular-nums">{row.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </HomeBlock>

        <HomeBlock
          id="spending"
          title={t("principal.spending.title")}
          hidden={home.spending === 0n}
        >
          <p data-spending className="text-figure font-semibold tabular-nums">
            {format.money(home.spending)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("principal.spending.period", {
              from: format.date(home.month.first),
              to: format.date(home.month.last),
            })}
          </p>
        </HomeBlock>
      </div>
    </>
  );
}

/** A plain list row with a link: the documents, suggestions and prompts of the Head's home. */
function LinkRow({
  href,
  title,
  line,
  aside,
}: {
  href: string;
  title: string;
  line: string;
  aside?: string;
}) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <Link
        href={href}
        className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1"
      >
        <span className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{line}</span>
        </span>
        {aside && <span className="shrink-0 text-sm font-semibold tabular-nums">{aside}</span>}
      </Link>
    </li>
  );
}

async function HeadHome({ userId, branch }: { userId: string; branch: string | null }) {
  const t = await getTranslations("home");
  const tReasons = await getTranslations("warehouse.writeOff.reasons");
  const format = await getFormatters();
  const home = await getHeadHome(userId, branch);
  // The Head's catalog lists: global, not of the top bar's branch (decided item 10).
  const suggestionCount = await countPendingSuggestions(userId);
  const suggestions = (await listSuggestions(userId)).rows
    .filter((row) => row.status === "PENDING")
    .slice(0, HOME_ROWS);
  const prompts = await getPricePrompts(userId);
  const product = (name: string, subtype: string | null) =>
    subtype ? `${name}, ${subtype}` : name;
  const code = (figures: { branchCode: string; isActive: boolean }) =>
    figures.isActive ? figures.branchCode : t("head.inactive", { code: figures.branchCode });

  // Nothing waits for a decision: one calm empty state before the branch figures.
  const nothing =
    home.waiting.count === 0 &&
    home.overspends.length === 0 &&
    home.writeOffs.count === 0 &&
    suggestionCount === 0 &&
    prompts.length === 0 &&
    home.stuck.total === 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {nothing && (
        <EmptyState
          icon="task_alt"
          title={t("allClear.title")}

          className="lg:col-span-2"
        />
      )}
      <HomeBlock
        id="waiting"
        now
        title={t("head.waiting.title")}
        count={home.waiting.count}
        hidden={home.waiting.count === 0}
        link={{
          href: listHref(home.filters.waiting),
          label: t("showAll", { count: home.waiting.count }),
        }}
        className="lg:col-span-2"
      >
        <ul className="flex flex-col divide-y divide-border">
          {home.waiting.lines.map((line) => (
            <li key={line.branchId}>
              <Link
                href={exactHref({ ...home.filters.waiting, branch: line.branchId })}
                data-waiting-branch={line.branchCode}
                className="flex min-h-11 items-center justify-between gap-3 py-2"
              >
                <span className="text-sm font-semibold">{line.branchCode}</span>
                <span className="text-sm tabular-nums">
                  {t("head.waiting.line", {
                    count: line.count,
                    total: format.money(line.totals.grand),
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <GroupLines
          groups={home.waiting.groups.groups.map(wireGroup)}
          listHref={listHref(home.filters.waiting)}
        />
      </HomeBlock>

      <HomeBlock
        id="overspends"
        now
        title={t("head.overspends.title")}
        count={home.overspends.length}
        hidden={home.overspends.length === 0}
        link={{
          href: listHref(home.filters.settlement),
          label: t("openList"),
        }}
      >
        <ul className="flex flex-col divide-y divide-border">
          {home.overspends.slice(0, HOME_ROWS).map((row) => (
            <LinkRow
              key={row.id}
              href={`/orders/${row.id}`}
              title={t("head.pair", {
                first: row.number,
                second: product(row.productName, row.subtypeName),
              })}
              line={row.branchCode}
              aside={
                row.percent === null
                  ? t("head.overspends.rowNoPercent", { over: format.money(row.over) })
                  : t("head.overspends.row", { over: format.money(row.over), percent: row.percent })
              }
            />
          ))}
        </ul>
      </HomeBlock>

      <HomeBlock
        id="write-offs"
        now
        title={t("head.writeOffs.title")}
        count={home.writeOffs.count}
        hidden={home.writeOffs.count === 0}
        link={{
          href: "/warehouse/documents",
          label: t("showAll", { count: home.writeOffs.count }),
        }}
      >
        <ul className="flex flex-col divide-y divide-border">
          {home.writeOffs.lines.map((row) => (
            <LinkRow
              key={row.id}
              href={`/warehouse/documents/${row.id}`}
              title={t("head.pair", { first: row.number, second: row.branchCode })}
              line={
                row.type === "COUNT"
                  ? t("head.writeOffs.countRow", {
                      date: format.date(row.docDate),
                      name: row.askedBy,
                    })
                  : t("head.writeOffs.row", {
                      date: format.date(row.docDate),
                      reason: row.reason ? tReasons(row.reason as WriteOffReason) : "",
                      name: row.askedBy,
                    })
              }
            />
          ))}
        </ul>
      </HomeBlock>

      <HomeBlock
        id="suggestions"
        title={t("head.suggestions.title")}
        count={suggestionCount}
        hidden={suggestionCount === 0}
        link={{ href: "/suggestions", label: t("showAll", { count: suggestionCount }) }}
      >
        <ul className="flex flex-col divide-y divide-border">
          {suggestions.map((row) => (
            <LinkRow
              key={row.id}
              href={`/suggestions/${row.id}`}
              title={row.name}
              line={t("head.suggestions.row", {
                name: row.branchCode,
                person: row.suggestedByName,
              })}
            />
          ))}
        </ul>
      </HomeBlock>

      <HomeBlock
        id="prompts"
        title={t("head.prompts.title")}
        count={prompts.length}
        hidden={prompts.length === 0}
        link={{ href: "/prices", label: t("showAll", { count: prompts.length }) }}
      >
        <ul className="flex flex-col divide-y divide-border">
          {prompts.slice(0, HOME_ROWS).map((row) => (
            <LinkRow
              key={`${row.branchId}:${row.variantId}`}
              href="/prices"
              title={t("head.pair", {
                first: product(row.productName, row.subtypeName),
                second: row.branchCode,
              })}
              line={t("head.prompts.row", {
                price: format.money(row.referencePrice ?? 0n),
                average: format.money(row.average),
                percent: Number(row.percent),
              })}
            />
          ))}
        </ul>
      </HomeBlock>

      <HomeBlock
        id="stuck"
        title={t("head.stuck.title", { hours: home.escalationHours })}
        count={home.stuck.total}
        hidden={home.stuck.total === 0}
        link={{
          href: listHref(home.filters.stuck),
          label: t("showAll", { count: home.stuck.total }),
        }}
      >
        <GroupLines
          groups={home.stuck.groups.map(wireGroup)}
          listHref={listHref(home.filters.stuck)}
        />
      </HomeBlock>

      <HomeBlock id="by-status" title={t("head.byStatus.title")} className="lg:col-span-2">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {home.branches.map((figures) => (
            <div
              key={figures.branchId}
              data-branch-counts={figures.branchCode}
              className="flex flex-col gap-2"
            >
              <h3 className="text-sm font-semibold">{code(figures)}</h3>
              {figures.byStatus.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("head.byStatus.empty")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {figures.byStatus.map((row) => (
                    <li key={row.status}>
                      <Link
                        href={exactHref({
                          ...NO_FILTERS,
                          status: row.status,
                          branch: figures.branchId,
                        })}
                        data-status-count={`${figures.branchCode}:${row.status}`}
                        className="flex min-h-11 items-center justify-between gap-3 py-2"
                      >
                        <RequestStatusLabel status={row.status} />
                        <span className="text-sm font-semibold tabular-nums">{row.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </HomeBlock>

      <HomeBlock id="spending" title={t("head.spending.title")} className="lg:col-span-2">
        <p className="text-xs text-muted-foreground">
          {t("head.spending.period", {
            from: format.date(home.month.first),
            to: format.date(home.month.last),
          })}
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {home.branches.map((figures) => (
            <li key={figures.branchId} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{code(figures)}</span>
              <span
                data-spending={figures.branchCode}
                className="text-heading font-semibold tabular-nums"
              >
                {format.money(figures.spending)}
              </span>
            </li>
          ))}
        </ul>
      </HomeBlock>
    </div>
  );
}

async function FinanceHome({ userId, branch }: { userId: string; branch: string | null }) {
  const t = await getTranslations("home");
  const format = await getFormatters();
  const home = await getFinanceHome(userId, branch);
  const money = await getMoneyWithManagers(userId, branch);
  const approvalCount = home.approvals.reduce((sum, entry) => sum + entry.count, 0);
  const settlementCount = home.settlements.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {approvalCount === 0 && settlementCount === 0 && money.length === 0 && (
        <EmptyState
          icon="task_alt"
          title={t("allClear.title")}

          className="lg:col-span-2"
        />
      )}
      <HomeBlock
        id="approvals"
        now
        title={t("finance.approvals.title")}
        count={approvalCount}
        hidden={approvalCount === 0}
        link={{
          href: listHref(home.filters.approvals),
          label: t("showAll", { count: approvalCount }),
        }}
      >
        <OwnerEntries
          entries={home.approvals.map((entry) => ({
            key: `${entry.ownerId}:${entry.branchId}`,
            ownerName: entry.ownerName,
            branchCode: entry.branchCode,
            href: exactHref(entry.filters),
            line: t("finance.approvals.entry", {
              count: entry.count,
              total: format.money(entry.planned),
            }),
            amount:
              entry.cashToGive > 0n
                ? t("finance.approvals.give", { amount: format.money(entry.cashToGive) })
                : t("finance.approvals.noCash"),
          }))}
        />
      </HomeBlock>

      <HomeBlock
        id="settlements"
        now
        title={t("finance.settlements.title")}
        count={settlementCount}
        hidden={settlementCount === 0}
        link={{
          href: listHref(home.filters.settlements),
          label: t("showAll", { count: settlementCount }),
        }}
      >
        <OwnerEntries
          entries={home.settlements.map((entry) => ({
            key: `${entry.ownerId}:${entry.branchId}`,
            ownerName: entry.ownerName,
            branchCode: entry.branchCode,
            href: exactHref(entry.filters),
            line: t("finance.settlements.entry", { count: entry.count }),
            amount:
              entry.net.direction === "TO_FINANCE"
                ? t("finance.settlements.receive", { amount: format.money(entry.net.amount) })
                : entry.net.direction === "TO_MANAGER"
                  ? t("finance.settlements.pay", { amount: format.money(entry.net.amount) })
                  : t("finance.settlements.none"),
          }))}
        />
      </HomeBlock>

      <HomeBlock
        id="money"
        title={t("finance.money.title")}
        count={money.length}
        hidden={money.length === 0}
        link={{ href: "/money", label: t("finance.money.open") }}
        className="lg:col-span-2"
      >
        <ul className="flex flex-col divide-y divide-border">
          {money.slice(0, HOME_ROWS).map((block) => (
            <LinkRow
              key={block.ownerId}
              href="/money"
              title={block.ownerName}
              line={[
                block.held > 0n
                  ? t("finance.money.held", { amount: format.money(block.held) })
                  : null,
                block.owed > 0n
                  ? t("finance.money.owed", { amount: format.money(block.owed) })
                  : null,
                t("finance.money.since", { date: format.date(block.since) }),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </ul>
      </HomeBlock>
    </div>
  );
}
