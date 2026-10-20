import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { DocumentStatusLabel } from "@/components/status-label";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isBusinessDate } from "@/domain/business-date";
import { DOCUMENT_TYPES, type DocumentType } from "@/domain/stock-documents";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { NewDocumentButtons } from "@/features/warehouse/components/new-document-buttons";
import { WarehouseTabs } from "@/features/warehouse/components/warehouse-tabs";
import {
  type DepartmentChoice,
  type DocumentsPage,
  documentDepartmentChoices,
  listStockDocuments,
} from "@/features/warehouse/queries/documents";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /warehouse/documents, the warehouse documents (09-warehouse.md, Stock screens: Documents; 11-
// screens-and-ux.md, Screens: "Warehouse documents | All"; rules 5, 8 and 12; plan of 5.12). Every
// document of the branches the user sees, newest first, filtered by type, date from and to, and
// department; filters, branch and page stay in the address. The list's branch is the address's
// `branch=`, else the top bar's choice (as Stock on hand). Each number links to the document's own
// page (decided item 3). The New buttons are Stock on hand's (decided item 10). At phone width
// the table scrolls inside its panel, as Stock on hand's.

const pageParam = z.coerce.number().int().min(1).catch(1);
const idParam = z.uuid().catch("");
const typeParam = z.enum(DOCUMENT_TYPES).or(z.literal("")).catch("");
const dateParam = z
  .string()
  .refine((value) => isBusinessDate(value))
  .or(z.literal(""))
  .catch("");

type Params = {
  page?: string | string[];
  type?: string | string[];
  from?: string | string[];
  to?: string | string[];
  department?: string | string[];
  branch?: string | string[];
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const EMPTY: DocumentsPage = { rows: [], page: 1, pages: 1, found: 0 };

/** The page, or an empty one when the `branch=` of the address is not the user's (03 rule 1). */
async function readDocuments(
  userId: string,
  filters: Parameters<typeof listStockDocuments>[1],
  page: number,
): Promise<{ list: DocumentsPage; departments: DepartmentChoice[] }> {
  try {
    return {
      list: await listStockDocuments(userId, filters, page),
      departments: await documentDepartmentChoices(userId, filters?.branch ?? null),
    };
  } catch (error) {
    if (error instanceof AuthorizationError && error.kind === "not_found") {
      return { list: EMPTY, departments: [] };
    }
    throw error;
  }
}

export default async function WarehouseDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requireUser("/warehouse/documents");
  const raw = await searchParams;
  const type = typeParam.parse(first(raw.type) ?? "");
  const from = dateParam.parse(first(raw.from) ?? "");
  const to = dateParam.parse(first(raw.to) ?? "");
  const department = idParam.parse(first(raw.department) ?? "");
  const addressBranch = idParam.parse(first(raw.branch) ?? "");
  const cookieBranch = await currentBranchChoice(
    user.id,
    (await cookies()).get(BRANCH_COOKIE)?.value,
  );
  const branch = addressBranch || cookieBranch;
  const { list, departments } = await readDocuments(
    user.id,
    {
      branch: branch || null,
      type: type || null,
      from: from || null,
      to: to || null,
      department: department || null,
    },
    pageParam.parse(first(raw.page)),
  );
  const t = await getTranslations("warehouse.documents");
  const format = await getFormatters();
  const filtered = type !== "" || from !== "" || to !== "" || department !== "";
  const manyBranches = new Set(departments.map((choice) => choice.branchCode)).size > 1;
  const href = (to_: number) => {
    const query = new URLSearchParams();
    if (type) query.set("type", type);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (department) query.set("department", department);
    if (addressBranch) query.set("branch", addressBranch);
    if (to_ > 1) query.set("page", String(to_));
    const text = query.toString();
    return `/warehouse/documents${text ? `?${text}` : ""}`;
  };
  const departmentLabel = (choice: DepartmentChoice) => {
    const name = manyBranches
      ? t("departmentOption", { name: choice.name, branch: choice.branchCode })
      : choice.name;
    return choice.isActive ? name : t("inactiveOption", { name });
  };
  const typeLabel = (value: DocumentType) => t(`types.${value}`);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <WarehouseTabs current="documents" role={user.role} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {t("title")}
          {list.found > 0 && (
            <span className="text-sm font-normal tracking-normal text-muted-foreground">
              {t("summary", { count: list.found })}
            </span>
          )}
        </h1>
        <div className="flex flex-wrap gap-3 max-sm:w-full max-sm:[&>*]:flex-1">
          <NewDocumentButtons userId={user.id} />
        </div>
      </div>

      {list.found === 0 && !filtered ? (
        <EmptyState title={t("emptyTitle")} line={t("emptyText")} />
      ) : (
        <>
          <form
            role="search"
            action="/warehouse/documents"
            className="flex flex-wrap items-end gap-2 max-sm:flex-col max-sm:items-stretch"
          >
            {addressBranch && <input type="hidden" name="branch" value={addressBranch} />}
            <label className="flex flex-col gap-1 text-sm leading-5 font-semibold">
              {t("filterType")}
              <Select name="type" defaultValue={type} className="w-full sm:w-48" data-filter-type>
                <option value="">{t("allTypes")}</option>
                {DOCUMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {typeLabel(value)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm leading-5 font-semibold">
              {t("from")}
              <Input
                type="date"
                name="from"
                defaultValue={from}
                className="sm:w-40"
                data-filter-from
              />
            </label>
            <label className="flex flex-col gap-1 text-sm leading-5 font-semibold">
              {t("to")}
              <Input type="date" name="to" defaultValue={to} className="sm:w-40" data-filter-to />
            </label>
            <label className="flex flex-col gap-1 text-sm leading-5 font-semibold">
              {t("filterDepartment")}
              <Select
                name="department"
                defaultValue={department}
                className="w-full sm:w-56"
                data-filter-department
              >
                <option value="">{t("allDepartments")}</option>
                {departments.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {departmentLabel(choice)}
                  </option>
                ))}
              </Select>
            </label>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("find")}
            </button>
            {filtered && (
              <Link
                href={
                  addressBranch
                    ? `/warehouse/documents?branch=${addressBranch}`
                    : "/warehouse/documents"
                }
                className={buttonVariants({ variant: "ghost" })}
              >
                {t("clear")}
              </Link>
            )}
          </form>

          {list.rows.length === 0 ? (
            <EmptyState title={t("noResultsTitle")} line={t("noResultsText")} />
          ) : (
            <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm leading-5">
                <thead className="bg-muted text-small font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.number")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.type")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.date")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.branch")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.department")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.status")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.createdBy")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} className="border-t" data-document-row={row.number}>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        <Link
                          href={`/warehouse/documents/${row.id}`}
                          className="font-semibold text-link underline-offset-2 hover:underline"
                        >
                          {row.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3" data-document-type={row.type}>
                        {typeLabel(row.type)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {format.date(row.docDate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.toBranchCode
                          ? t("transferBranches", { from: row.branchCode, to: row.toBranchCode })
                          : row.branchCode}
                      </td>
                      <td className="px-4 py-3">{row.departmentName ?? ""}</td>
                      <td className="px-4 py-3">
                        <DocumentStatusLabel type={row.type} status={row.status} />
                      </td>
                      <td className="px-4 py-3">{row.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {list.pages > 1 && <PageLinks page={list.page} pages={list.pages} href={href} />}
        </>
      )}
    </div>
  );
}
