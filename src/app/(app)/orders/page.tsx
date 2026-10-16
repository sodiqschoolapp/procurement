import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { isDraftEditable, isNeverSubmitted, seesDraftsGrid } from "@/domain/drafts";
import { decide } from "@/domain/permissions";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice, listMyBranches } from "@/features/catalog/queries/my-branches";
import { DraftsGrid, type GridRow } from "@/features/orders/components/drafts-grid";
import { OwnersSwitch } from "@/features/orders/components/owners-switch";
import { wireDraft } from "@/features/orders/draft-wire";
import { listDrafts } from "@/features/orders/queries/drafts";
import { requireUser } from "@/server/auth/session";
import { authorizeList } from "@/server/authorize";

import { PageLinks } from "../catalog/page-links";

// /orders (11-screens-and-ux.md, Screens: "Order list, with the drafts grid … drafts for
// Manager and Head"; Order list layout 3; plan of 2.5b). The Manager and the Head get the drafts
// grid of the branch the top bar names, or of all their branches; the Head may show every
// owner's drafts (`?owners=all`). Whether a row is edited or deleted, and whether a draft may be
// added in a branch, is decide() with the same actor the server checks (decided items 2 and 3);
// the server refuses again. The Principal and Finance see the title and an empty state until the
// order list comes (2.8; decided item 11): nothing of a draft reaches them.

const pageParam = z.coerce.number().int().min(1).catch(1);

type Params = { page?: string | string[]; owners?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/orders");
  const t = await getTranslations("orders");

  const title = (
    <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
  );

  if (!seesDraftsGrid(user.role)) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {title}
        <EmptyState title={t("listComing.title")} line={t("listComing.line")} />
      </div>
    );
  }

  const raw = await searchParams;
  const everyOwner = user.role === "HEAD" && first(raw.owners) === "all";
  const branchId = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);
  const list = await listDrafts(user.id, {
    page: pageParam.parse(first(raw.page)),
    branchId,
    owners: everyOwner ? "all" : null,
  });
  const actor = await authorizeList(user.id, "data.view");
  const branches = (await listMyBranches(user.id)).map((branch) => ({
    ...branch,
    canCreate: decide("request.create", actor, { branchId: branch.id }) === "allow",
  }));
  const rows: GridRow[] = list.rows.map((row) => {
    const editable =
      isDraftEditable(row.status) &&
      decide("request.edit", actor, { branchId: row.branchId, ownerId: row.ownerId }) === "allow";
    return {
      row: wireDraft(row),
      editable,
      deletable: editable && row.ownerId === actor.userId && isNeverSubmitted(row),
    };
  });
  const chosen = branches.find((branch) => branch.id === branchId);
  const defaultBranchId = chosen?.canCreate && chosen.isActive ? chosen.id : null;
  const canAdd = branches.some((branch) => branch.canCreate && branch.isActive);
  const query = everyOwner ? "owners=all" : "";
  const href = (to: number) => {
    const params = new URLSearchParams(query);
    if (to > 1) params.set("page", String(to));
    const text = params.toString();
    return `/orders${text ? `?${text}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title}
        {user.role === "HEAD" && <OwnersSwitch all={everyOwner} />}
      </div>
      {list.total === 0 && <EmptyState title={t("empty.title")} line={t("empty.line")} />}
      <DraftsGrid
        rows={rows}
        page={list.page}
        total={list.total}
        branches={branches}
        actorId={actor.userId}
        defaultBranchId={defaultBranchId}
        canAdd={canAdd}
        query={query}
      />
      {list.pages > 1 && <PageLinks page={list.page} pages={list.pages} href={href} />}
    </div>
  );
}
