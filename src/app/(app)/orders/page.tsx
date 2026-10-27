import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type SummaryFigure, SummaryStrip } from "@/components/summary-strip";
import { TabLinks } from "@/components/tab-links";
import { buttonVariants } from "@/components/ui/button";
import {
  addsDraftsIn,
  draftRowRights,
  draftSubmittable,
  draftSubmittableAgain,
  seesDraftsGrid,
} from "@/domain/drafts";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice, listMyBranches } from "@/features/catalog/queries/my-branches";
import { DownloadButtons } from "@/features/orders/components/download-buttons";
import { DraftsGrid, type GridRow } from "@/features/orders/components/drafts-grid";
import { ListFiltersBar } from "@/features/orders/components/list-filters";
import { OrderList } from "@/features/orders/components/order-list";
import { OwnersSwitch } from "@/features/orders/components/owners-switch";
import { wireDraft } from "@/features/orders/draft-wire";
import {
  type ListFilters,
  NO_FILTERS,
  activeFilterCount,
  listFiltersParams,
  parseListFilters,
} from "@/features/orders/list-filters";
import { wireGroup } from "@/features/orders/list-wire";
import { listDrafts } from "@/features/orders/queries/drafts";
import {
  type OrderGroupPage,
  countOrdersByStatus,
  listOrderFilterChoices,
  listOrderGroups,
  orderTotalsOnFilter,
} from "@/features/orders/queries/order-list";
import type { ListStatus } from "@/domain/order-list";
import { type Role, actorMay } from "@/domain/permissions";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError, authorizeList } from "@/server/authorize";
import { getPlannedSum } from "@/features/orders/components/planned-sum-server";

import { PageLinks } from "../catalog/page-links";

// /orders (11-screens-and-ux.md, Screens: "Order list, with the drafts grid … drafts for
// Manager and Head"; Order list layout 1 to 4; plan of 2.8). Every role gets the order list on
// top: the filters, then group rows, 25 a page (`?page=`), each filter and the sort in the
// address. The list's branch is the address's `branch=`, else the top bar's choice (decided item
// 12). The Manager and the Head get the drafts grid below it, of the top bar's branch, paged with
// `?draftsPage=` (plan of 2.5b); the Head may show every owner's drafts (`?owners=all`). Each
// pager keeps every other parameter of the address. Whether a draft row is edited or deleted, and
// whether a draft may be added in a branch, is draftRowRights() and addsDraftsIn() of
// src/domain/drafts.ts; the server refuses again.

const pageParam = z.coerce.number().int().min(1).catch(1);

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The address of /orders with one parameter changed and every other kept. */
function addressWith(raw: Params, name: string, value: number): string {
  const params = new URLSearchParams();
  for (const [key, given] of Object.entries(raw)) {
    const one = first(given);
    if (key !== name && one !== undefined) params.set(key, one);
  }
  if (value > 1) params.set(name, String(value));
  const text = params.toString();
  return `/orders${text ? `?${text}` : ""}`;
}

/** The list's page, or an empty one when the `branch=` of the address is not the user's. */
async function readList(userId: string, filters: ListFilters, page: number) {
  try {
    return await listOrderGroups(userId, filters, page);
  } catch (error) {
    // Another branch is "Not found" (03 rule 1): the same empty list as no orders.
    if (error instanceof AuthorizationError && error.kind === "not_found") {
      return { groups: [], page: 1, pages: 1, total: 0 } satisfies OrderGroupPage;
    }
    throw error;
  }
}

/** A count or total read the way the list reads it; another branch reads as nothing (03 rule 1). */
async function orNothing<T>(read: () => Promise<T>, nothing: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AuthorizationError && error.kind === "not_found") return nothing;
    throw error;
  }
}

/** The address of the list with exactly these filters, the drafts grid's parameters kept. */
function listAddress(filters: ListFilters, raw: Params): string {
  const params = listFiltersParams(filters);
  for (const name of ["owners", "draftsPage"]) {
    const value = first(raw[name]);
    if (value !== undefined) params.set(name, value);
  }
  const text = params.toString();
  return `/orders${text ? `?${text}` : ""}`;
}

/**
 * The statuses each role acts on, for the summary strip (docs/design-system.md, Summary strip).
 * A label only: what a person may do is the state machine's, asked again by the server.
 */
const ACTS_ON: Record<Role, readonly [ListStatus, ...ListStatus[]]> = {
  MANAGER: ["RETURNED", "PURCHASING"],
  HEAD: ["PENDING_HEAD", "PURCHASING", "SETTLEMENT"],
  PRINCIPAL: ["PENDING_PRINCIPAL", "PURCHASING"],
  FINANCE: ["PENDING_FINANCE", "SETTLEMENT", "PURCHASING"],
};

/**
 * The summary strip of the list: how many orders stand in the statuses the role acts on, the first
 * with its planned total, and how many are due within 7 days. Every number is a query the app
 * already shows (countOrdersByStatus and orderTotalsOnFilter of the home pages, the "due soon"
 * filter of the Manager's home); a Manager's figures are of the Manager's own orders, as on Home.
 */
async function summaryFigures(
  userId: string,
  role: Role,
  branch: string | null,
  raw: Params,
): Promise<SummaryFigure[]> {
  const t = await getTranslations("orders.list.summary");
  const tStatus = await getTranslations("requestStatus");
  const plannedSum = await getPlannedSum();
  const base: ListFilters = { ...NO_FILTERS, branch, owner: role === "MANAGER" ? userId : null };
  const [mainStatus, ...otherStatuses] = ACTS_ON[role];
  const byStatus = await orNothing(() => countOrdersByStatus(userId, base), []);
  const main = await orNothing(
    () => orderTotalsOnFilter(userId, { ...base, status: mainStatus }),
    null,
  );
  const due = await orNothing(() => countOrdersByStatus(userId, { ...base, dueSoon: true }), []);
  const mainCount = main?.count ?? 0;
  const dueCount = due.reduce((sum, row) => sum + row.count, 0);
  // A figure of 0 opens nothing: it is a plain figure, not a link and not a stop of the Tab key.

  return [
    {
      id: mainStatus,
      label: role === "MANAGER" ? tStatus(mainStatus) : t("waitingForMe"),
      value: mainCount,
      note:
        main && mainCount > 0
          ? plannedSum(main.totals.grand, main.totals.unpriced, mainCount)
          : undefined,
      href: mainCount > 0 ? listAddress({ ...base, status: mainStatus }, raw) : undefined,
      now: mainCount > 0,
    },
    ...otherStatuses.map((status) => {
      const count = byStatus.find((row) => row.status === status)?.count ?? 0;
      return {
        id: status,
        label: tStatus(status),
        value: count,
        href: count > 0 ? listAddress({ ...base, status }, raw) : undefined,
      };
    }),
    {
      id: "dueSoon",
      label: t("dueSoon"),
      value: dueCount,
      href: dueCount > 0 ? listAddress({ ...base, dueSoon: true }, raw) : undefined,
    },
  ];
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/orders");
  const t = await getTranslations("orders");
  const raw = await searchParams;

  const cookieBranch = await currentBranchChoice(
    user.id,
    (await cookies()).get(BRANCH_COOKIE)?.value,
  );
  const parsed = parseListFilters(raw);
  // Without a `branch=` the list follows the top bar (decided item 12).
  const filters: ListFilters = { ...parsed.filters, branch: parsed.filters.branch ?? cookieBranch };
  const addressFilters = listFiltersParams(parsed.filters);
  const list = await readList(user.id, filters, pageParam.parse(first(raw.page)));
  const choices = await listOrderFilterChoices(user.id);
  const myBranches = await listMyBranches(user.id);
  const listHrefs = Object.fromEntries(
    [list.page - 1, list.page + 1].map((to) => [to, addressWith(raw, "page", to)]),
  );
  const filtered = activeFilterCount(parsed.filters) > 0;

  const listQuery = listFiltersParams(filters).toString();
  const markActor = await authorizeList(user.id, "data.view");
  // The status tabs: every status the other filters hold, with its count (countOrdersByStatus,
  // the query of the home pages), and the chosen one even when it holds none.
  const statusCounts = await orNothing(
    () => countOrdersByStatus(user.id, { ...filters, status: null }),
    [],
  );
  const chosenStatus = parsed.filters.status;
  const shownStatuses =
    chosenStatus && !statusCounts.some((row) => row.status === chosenStatus)
      ? [...statusCounts, { status: chosenStatus, count: 0 }]
      : statusCounts;
  const tStatus = await getTranslations("requestStatus");
  const figures = await summaryFigures(user.id, user.role, cookieBranch, raw);
  // The "your turn" mark only where the person can act: a Manager's sent-back row is marked only
  // in a branch where their right to add and send orders is on (addsDraftsIn of the drafts grid;
  // plan review of the redesign, correction 2).
  const turnBranchIds =
    user.role === "MANAGER"
      ? myBranches.filter((branch) => addsDraftsIn(markActor, branch)).map((branch) => branch.id)
      : null;

  const listSection = (
    <section aria-labelledby="order-list-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="order-list-title" className="sr-only">
        {t("list.title")}
      </h2>
      <TabLinks
        label={t("list.tabs.label")}
        tabs={[
          {
            id: "all",
            href: listAddress({ ...parsed.filters, status: null }, raw),
            label: t("list.tabs.all"),
            current: chosenStatus === null,
          },
          ...shownStatuses.map((row) => ({
            id: row.status,
            href: listAddress({ ...parsed.filters, status: row.status }, raw),
            label: tStatus(row.status),
            count: row.count,
            current: chosenStatus === row.status,
          })),
        ]}
      />
      <ListFiltersBar
        filters={parsed.filters}
        topBarBranch={parsed.filters.branch === null ? cookieBranch : null}
        ignored={parsed.ignored}
        branches={myBranches}
        choices={choices}
      />
      {/* The list shows the empty page itself, so a refusal it holds outlives the refresh. */}
      <OrderList
        // A change of filter or sort starts a new selection; a change of page keeps it (review
        // of the plan, correction 1).
        key={listQuery}
        groups={list.groups.map(wireGroup)}
        page={list.page}
        pages={list.pages}
        total={list.total}
        query={listQuery}
        hrefOf={listHrefs}
        role={user.role}
        meId={user.id}
        turnBranchIds={turnBranchIds}
        empty={{
          title: t(filtered ? "list.emptyFiltered.title" : "list.empty.title"),
          line: t(filtered ? "list.emptyFiltered.line" : "list.empty.line"),
        }}
      />
    </section>
  );

  const header = (canAdd: boolean) => (
    <PageHeader
      title={t("title")}
      actions={
        <>
          <DownloadButtons query={listQuery} />
          {canAdd && (
            // The form of the drafts grid below (05 Drafts; 11 Order list layout 3).
            <a href="#new-order" data-new-order-link className={buttonVariants()}>
              {t("newOrder")}
            </a>
          )}
        </>
      }
    />
  );
  const strip = <SummaryStrip label={t("list.summary.label")} figures={figures} />;

  if (!seesDraftsGrid(user.role)) {
    return (
      <div className="flex flex-col gap-5">
        {header(false)}
        {strip}
        {listSection}
      </div>
    );
  }

  const everyOwner = user.role === "HEAD" && first(raw.owners) === "all";
  const drafts = await listDrafts(user.id, {
    page: pageParam.parse(first(raw.draftsPage)),
    branchId: cookieBranch,
    owners: everyOwner ? "all" : null,
  });
  const actor = await authorizeList(user.id, "data.view");
  const branches = myBranches.map((branch) => ({
    ...branch,
    canCreate: addsDraftsIn(actor, branch),
  }));
  const rows: GridRow[] = drafts.rows.map((row) => ({
    row: wireDraft(row),
    ...draftRowRights(actor, row),
    submittable: draftSubmittable(actor, row),
    submittableAgain: draftSubmittableAgain(actor, row),
  }));
  const chosen = branches.find((branch) => branch.id === cookieBranch);
  const defaultBranchId = chosen?.canCreate ? chosen.id : null;
  const canAdd = branches.some((branch) => branch.canCreate);
  // The grid's own address: every parameter but its page (plan of 2.5b, Should fix 2).
  const gridQuery = new URLSearchParams(addressFilters);
  if (everyOwner) gridQuery.set("owners", "all");
  const pageOfList = first(raw.page);
  if (pageOfList) gridQuery.set("page", pageOfList);
  const query = gridQuery.toString();

  return (
    <div className="flex flex-col gap-5">
      {header(canAdd)}
      {strip}
      {listSection}
      <section aria-labelledby="drafts-title" className="mt-4 flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="drafts-title" className="flex items-baseline gap-2 text-heading">
            {t("draftsTitle")}
            {drafts.total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">{drafts.total}</span>
            )}
          </h2>
          {user.role === "HEAD" && <OwnersSwitch all={everyOwner} />}
        </div>
        {drafts.total === 0 && (
          // 11 rule 12: the empty grid says what belongs there; the New order form below is its
          // button. A Manager who may only view orders is not told to add one (spec review, Should
          // fix 7).
          <EmptyState
            icon="edit"
            title={t("empty.title")}
            line={t(canAdd ? "empty.line" : "empty.lineViewOnly")}
            className="py-6 sm:py-8"
          />
        )}
        <DraftsGrid
          rows={rows}
          submitSet={drafts.submitSet}
          today={drafts.today}
          fields={drafts.fields}
          page={drafts.page}
          total={drafts.total}
          branches={branches}
          actorId={actor.userId}
          canAddToCatalog={actorMay("catalog.add", actor)}
          defaultBranchId={defaultBranchId}
          canAdd={canAdd}
          query={query}
        />
        {drafts.pages > 1 && (
          <PageLinks
            page={drafts.page}
            pages={drafts.pages}
            href={(to) => addressWith(raw, "draftsPage", to)}
          />
        )}
      </section>
    </div>
  );
}
