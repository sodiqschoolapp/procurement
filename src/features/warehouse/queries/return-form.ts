import { and, asc, eq, exists, ilike, inArray, or } from "drizzle-orm";
import * as z from "zod";

import { DRAFT_PICKER_MAX } from "@/domain/drafts";
import { departmentHolds } from "@/domain/stock-documents";
import { AuthorizationError, authorize, authorizeList, branchFilter } from "@/server/authorize";
import { departmentHoldsSql, departmentReceived } from "@/server/department-received";
import {
  branches,
  departments,
  productVariants,
  products,
  stockBalances,
  units,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// The choices of the return form, /warehouse/documents/new?type=RETURN (09-warehouse.md, Other
// documents: Return from a department; plan of 5.6). All under `stock.return_reverse` (03
// Permission matrix, "Issue, return, transfer stock"; Manager right RETURN_REVERSE: decided item
// 4, Look first), so a branch the user may not return in is refused as authorize() refuses it.
// Active departments and active items (decided item 8), and an inactive product or subtype only
// where the department holds it, marked (04 rule 2: "returned by a department that received it;
// the stock pickers list it marked 'inactive'"; plan of 7.4b, decided item 4, Look first), by the
// SQL of departmentHoldsSql(), the amount the return action checks. Unlike the issue's search, a
// subtype with no stock is listed: a return raises it.

export type ReturnBranch = { id: string; code: string; name: string };

export type ReturnDepartment = { id: string; name: string };

export type ReturnSubtype = {
  id: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  name: string | null;
  /** The stock of the branch, numeric(14,3) text, "0" when it never had any. */
  inStock: string;
  /** The department's net received amount (departmentReceived(), decided item 2, Look first). */
  received: string;
  /** The subtype or its product is switched off (04 rule 2: listed "marked inactive"). */
  inactive: boolean;
};

export type ReturnItem = {
  id: string;
  name: string;
  unitShortName: string;
  allowsDecimals: boolean;
  subtypes: ReturnSubtype[];
};

const idInput = z.uuid();
const searchInput = z.string().trim().max(200).catch("");

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** The active branches where the user may take returns, by code; the branch filter is in the SQL. */
export async function returnBranchChoices(userId: string): Promise<ReturnBranch[]> {
  const actor = await authorizeList(userId, "stock.return_reverse");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return db
    .select({ id: branches.id, code: branches.code, name: branches.name })
    .from(branches)
    .where(and(eq(branches.isActive, true), branchFilter(actor, branches.id)))
    .orderBy(asc(branches.code));
}

/** The branch's active departments. */
export async function returnFormChoices(
  userId: string,
  options: { branchId: string },
): Promise<ReturnDepartment[]> {
  const branchId = idInput.parse(options.branchId);
  await authorize(userId, "stock.return_reverse", { branchId });
  const { db } = await import("@/server/db/client");
  return db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(and(eq(departments.branchId, branchId), eq(departments.isActive, true)))
    .orderBy(asc(departments.name), asc(departments.id));
}

/**
 * Up to 20 active goods products whose name holds `q` (any case), each with its active subtypes,
 * the branch's stock and what the department received of each; within the page, the products the
 * department holds come first, then by name. A department not of the branch is "Not found". One
 * snapshot, so the stock and the received amounts are of one moment.
 */
export async function searchReturnItems(
  userId: string,
  options: { branchId: string; departmentId: string; q?: string },
): Promise<ReturnItem[]> {
  const branchId = idInput.parse(options.branchId);
  const departmentId = idInput.parse(options.departmentId);
  await authorize(userId, "stock.return_reverse", { branchId });
  const q = searchInput.parse(options.q ?? "");

  return readSnapshot(async (executor) => {
    const [department] = await executor
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.id, departmentId), eq(departments.branchId, branchId)));
    if (!department) throw new AuthorizationError("not_found");
    const scope = { branchId, departmentId };

    const found = await executor
      .select({
        id: products.id,
        name: products.name,
        unitShortName: units.shortName,
        allowsDecimals: units.allowDecimal,
        isActive: products.isActive,
      })
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .where(
        and(
          or(
            eq(products.isActive, true),
            exists(
              executor
                .select({ id: productVariants.id })
                .from(productVariants)
                .where(
                  and(
                    eq(productVariants.productId, products.id),
                    departmentHoldsSql(scope, productVariants.id),
                  ),
                ),
            ),
          ),
          eq(products.type, "GOODS"),
          q === "" ? undefined : ilike(products.name, containing(q)),
        ),
      )
      .orderBy(asc(products.name), asc(products.id))
      .limit(DRAFT_PICKER_MAX);
    if (found.length === 0) return [];

    const subtypes = await executor
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        name: productVariants.name,
        isDefault: productVariants.isDefault,
        isActive: productVariants.isActive,
        inStock: stockBalances.qty,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(
        stockBalances,
        and(eq(stockBalances.variantId, productVariants.id), eq(stockBalances.branchId, branchId)),
      )
      .where(
        and(
          inArray(
            productVariants.productId,
            found.map((product) => product.id),
          ),
          or(
            and(eq(productVariants.isActive, true), eq(products.isActive, true)),
            departmentHoldsSql(scope, productVariants.id),
          ),
        ),
      )
      .orderBy(asc(productVariants.name), asc(productVariants.id));
    const received = await departmentReceived(executor, {
      branchId,
      departmentId,
      variantIds: subtypes.map((subtype) => subtype.id),
    });

    const items = found
      .map(({ isActive, ...product }) => ({
        ...product,
        subtypes: subtypes
          .filter((subtype) => subtype.productId === product.id)
          .map((subtype) => ({
            id: subtype.id,
            name: subtype.isDefault ? null : subtype.name,
            inStock: subtype.inStock ?? "0",
            received: received.get(subtype.id)!,
            inactive: !isActive || !subtype.isActive,
          })),
      }))
      .filter((item) => item.subtypes.length > 0);
    const holds = (item: ReturnItem) =>
      item.subtypes.some((subtype) => departmentHolds(subtype.received));
    // A stable sort keeps the name order inside each group.
    return [...items.filter(holds), ...items.filter((item) => !holds(item))];
  });
}
