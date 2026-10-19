import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { seesStockCounts } from "@/components/shell/menu";
import { DocumentStatusLabel } from "@/components/status-label";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { CountStartButton } from "@/features/warehouse/components/count-start-button";
import { WarehouseTabs } from "@/features/warehouse/components/warehouse-tabs";
import { type CountsPage, listCounts } from "@/features/warehouse/queries/counts";
import { countBranchChoices } from "@/features/warehouse/queries/issue-form";
import { stockCategoryChoices } from "@/features/warehouse/queries/stock-on-hand";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /warehouse/counts, the stock counts (09-warehouse.md, Other documents, Stock count; 11-screens-
// and-ux.md, Screens: "Stock counts | /warehouse/counts | Manager, Head"; plan of 7.3). The
// Principal and Finance get the "Not found" page; they read a count in Documents. The counts of
// the branches the user sees, newest first, 25 a page, each with how many of its lines are
// counted, each number opening the count's page, where the quantities are typed (decided item
// 10). The list's branch is the address's `branch=`, else the top bar's choice (as Documents).
// "Start a count" where the user may start one in an active branch (`countBranchChoices`). At
// phone width the table scrolls inside its panel, as Documents'.

const pageParam = z.coerce.number().int().min(1).catch(1);
const idParam = z.uuid().catch("");

type Params = { page?: string | string[]; branch?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const EMPTY: CountsPage = { rows: [], page: 1, pages: 1, found: 0 };

/** The page, or an empty one when the `branch=` of the address is not the user's (03 rule 1). */
async function readCounts(userId: string, branch: string | null, page: number) {
  try {
    return await listCounts(userId, { branch }, page);
  } catch (error) {
    if (error instanceof AuthorizationError && error.kind === "not_found") return EMPTY;
    throw error;
  }
}

/** The branches a count can start in; none when the user may not start one. */
async function startBranches(userId: string) {
  try {
    return await countBranchChoices(userId);
  } catch (error) {
    if (error instanceof AuthorizationError) return [];
    throw error;
  }
}

export default async function StockCountsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/warehouse/counts");
  if (!seesStockCounts(user.role)) notFound();
  const raw = await searchParams;
  const addressBranch = idParam.parse(first(raw.branch) ?? "");
  const cookieBranch = await currentBranchChoice(
    user.id,
    (await cookies()).get(BRANCH_COOKIE)?.value,
  );
  const branch = addressBranch || cookieBranch;
  const list = await readCounts(user.id, branch || null, pageParam.parse(first(raw.page)));
  const branches = await startBranches(user.id);
  const categories = branches.length > 0 ? await stockCategoryChoices(user.id) : [];
  const t = await getTranslations("warehouse.count");
  const format = await getFormatters();
  const href = (to: number) => {
    const query = new URLSearchParams();
    if (addressBranch) query.set("branch", addressBranch);
    if (to > 1) query.set("page", String(to));
    const text = query.toString();
    return `/warehouse/counts${text ? `?${text}` : ""}`;
  };
  const initialBranchId = branches.find((each) => each.id === branch)?.id ?? branches[0]?.id ?? "";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <WarehouseTabs current="counts" role={user.role} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t("title")}
          {list.found > 0 && (
            <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
              {t("summary", { count: list.found })}
            </span>
          )}
        </h1>
        {branches.length > 0 && (
          <div className="max-sm:w-full">
            <CountStartButton
              branches={branches}
              categories={categories}
              initialBranchId={initialBranchId}
            />
          </div>
        )}
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} line={t("emptyText")} />
      ) : (
        <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm leading-5">
            <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t("columns.number")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("columns.date")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("columns.branch")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("columns.status")}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t("columns.progress")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("columns.createdBy")}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className="border-t" data-count-row={row.number}>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">
                    <Link
                      href={`/warehouse/documents/${row.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {row.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {format.date(row.docDate)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.branchCode}</td>
                  <td className="px-4 py-3">
                    <DocumentStatusLabel type="COUNT" status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" data-count-progress>
                    {t("progress", {
                      counted: format.quantity(String(row.counted)),
                      lines: format.quantity(String(row.lines)),
                    })}
                  </td>
                  <td className="px-4 py-3">{row.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {list.pages > 1 && <PageLinks page={list.page} pages={list.pages} href={href} />}
    </div>
  );
}
