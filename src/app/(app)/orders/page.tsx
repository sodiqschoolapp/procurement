import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
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
  activeFilterCount,
  listFiltersParams,
  parseListFilters,
} from "@/features/orders/list-filters";
import { wireGroup } from "@/features/orders/list-wire";
import { listDrafts } from "@/features/orders/queries/drafts";
import {
  type OrderGroupPage,
  listOrderFilterChoices,
  listOrderGroups,
} from "@/features/orders/queries/order-list";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError, authorizeList } from "@/server/authorize";

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

  const title = (
    <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
  );
  const listSection = (
    <section aria-labelledby="order-list-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="order-list-title" className="text-[20px] leading-7 font-bold">
          {t("list.title")}
        </h2>
        <DownloadButtons query={listFiltersParams(filters).toString()} />
      </div>
      <ListFiltersBar
        filters={parsed.filters}
        topBarBranch={parsed.filters.branch === null ? cookieBranch : null}
        ignored={parsed.ignored}
        branches={myBranches}
        choices={choices}
      />
      {list.total === 0 ? (
        <EmptyState
          title={t(filtered ? "list.emptyFiltered.title" : "list.empty.title")}
          line={t(filtered ? "list.emptyFiltered.line" : "list.empty.line")}
        />
      ) : (
        <OrderList
          // A change of filter or sort starts a new selection; a change of page keeps it (review
          // of the plan, correction 1).
          key={listFiltersParams(filters).toString()}
          groups={list.groups.map(wireGroup)}
          page={list.page}
          pages={list.pages}
          total={list.total}
          query={listFiltersParams(filters).toString()}
          hrefOf={listHrefs}
        />
      )}
    </section>
  );

  if (!seesDraftsGrid(user.role)) {
    return (
      <div className="flex flex-col gap-6">
        {title}
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
    <div className="flex flex-col gap-6">
      {title}
      {listSection}
      <section aria-labelledby="drafts-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="drafts-title" className="text-[20px] leading-7 font-bold">
            {t("draftsTitle")}
          </h2>
          {user.role === "HEAD" && <OwnersSwitch all={everyOwner} />}
        </div>
        {drafts.total === 0 && (
          // A Manager who may only view orders is not told to add one (spec review, Should fix 7).
          <EmptyState
            title={t("empty.title")}
            line={t(canAdd ? "empty.line" : "empty.lineViewOnly")}
          />
        )}
        <DraftsGrid
          rows={rows}
          page={drafts.page}
          total={drafts.total}
          branches={branches}
          actorId={actor.userId}
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
