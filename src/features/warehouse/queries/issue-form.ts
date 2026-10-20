import { and, asc, eq, exists, gt, ilike, inArray } from "drizzle-orm";
import * as z from "zod";

import { DRAFT_PICKER_MAX } from "@/domain/drafts";
import type { Permission } from "@/domain/permissions";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import {
  branches,
  departments,
  productVariants,
  products,
  stockBalances,
  units,
} from "@/server/db/schema";

// The choices of the issue form, /warehouse/documents/new?type=ISSUE (09-warehouse.md, Issue to a
// department: Branch, Department, Received by, Lines "Current stock is shown beside each line";
// plan of 5.4). All under `stock.issue` (03 Permission matrix, "Issue, return, transfer stock":
// the Head any branch, a Manager own branches with ISSUE_STOCK), so a branch the user may not issue
// in is refused as authorize() refuses it. Active departments only. The stock items take inactive
// products and subtypes too, marked, since their stock can still go out (04 rule 2: "the stock
// pickers list it marked 'inactive'"; plan of 7.4b, decided items 3 and 6). The write-off form (09 Other documents, Write-off; plan
// of 5.11) picks from the same items in stock under `stock.ask_write_off` (the Head any branch, a
// Manager own branches with WRITE_OFF_COUNT), and the transfer form (09 Other documents,
// Transfer; plan of 7.1) under `stock.transfer` (a Manager with TRANSFER_STOCK): one reader,
// asked with any of the three.

export type IssueBranch = { id: string; code: string; name: string };

export type IssueDepartment = { id: string; name: string; responsibleName: string | null };

export type IssueSubtype = {
  id: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  name: string | null;
  /** The stock of the branch, numeric(14,3) text as stored, above 0. */
  inStock: string;
  /** The subtype or its product is switched off (04 rule 2: listed "marked inactive"). */
  inactive: boolean;
};

export type IssueItem = {
  id: string;
  name: string;
  unitShortName: string;
  allowsDecimals: boolean;
  subtypes: IssueSubtype[];
};

const branchInput = z.uuid();
const searchInput = z.string().trim().max(200).catch("");

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** The active branches where the user may issue, by code; the branch filter is in the SQL. */
export async function issueBranchChoices(userId: string): Promise<IssueBranch[]> {
  return branchChoices(userId, "stock.issue");
}

/** The active branches where the user may ask for a write-off (plan of 5.11). */
export async function writeOffBranchChoices(userId: string): Promise<IssueBranch[]> {
  return branchChoices(userId, "stock.ask_write_off");
}

/** The active branches the user may send a transfer from (plan of 7.1). */
export async function transferBranchChoices(userId: string): Promise<IssueBranch[]> {
  return branchChoices(userId, "stock.transfer");
}

/** The active branches the user may start a count in (plan of 7.3). */
export async function countBranchChoices(userId: string): Promise<IssueBranch[]> {
  return branchChoices(userId, "stock.start_count");
}

type StockPermission = Extract<
  Permission,
  "stock.issue" | "stock.ask_write_off" | "stock.transfer" | "stock.start_count"
>;

async function branchChoices(userId: string, permission: StockPermission): Promise<IssueBranch[]> {
  const actor = await authorizeList(userId, permission);
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return db
    .select({ id: branches.id, code: branches.code, name: branches.name })
    .from(branches)
    .where(and(eq(branches.isActive, true), branchFilter(actor, branches.id)))
    .orderBy(asc(branches.code));
}

/** The branch's active departments with their responsible person, the prefill of Received by. */
export async function issueFormChoices(
  userId: string,
  options: { branchId: string },
): Promise<IssueDepartment[]> {
  const branchId = branchInput.parse(options.branchId);
  await authorize(userId, "stock.issue", { branchId });
  const { db } = await import("@/server/db/client");
  return db
    .select({
      id: departments.id,
      name: departments.name,
      responsibleName: departments.responsibleName,
    })
    .from(departments)
    .where(and(eq(departments.branchId, branchId), eq(departments.isActive, true)))
    .orderBy(asc(departments.name), asc(departments.id));
}

/**
 * Up to 20 goods products whose name holds `q` (any case), by name, each with its subtypes whose
 * stock in the branch is above 0, that stock and whether it is inactive. A product with none is
 * left out.
 */
export async function searchIssueItems(
  userId: string,
  options: { branchId: string; q?: string },
): Promise<IssueItem[]> {
  return itemsInStock(userId, "stock.issue", options);
}

/** The same items, for a write-off (plan of 5.11): nothing beyond the stock is written off. */
export async function searchWriteOffItems(
  userId: string,
  options: { branchId: string; q?: string },
): Promise<IssueItem[]> {
  return itemsInStock(userId, "stock.ask_write_off", options);
}

/** The same items, for a transfer (plan of 7.1): only what the sender holds is sent. */
export async function searchTransferItems(
  userId: string,
  options: { branchId: string; q?: string },
): Promise<IssueItem[]> {
  return itemsInStock(userId, "stock.transfer", options);
}

async function itemsInStock(
  userId: string,
  permission: StockPermission,
  options: { branchId: string; q?: string },
): Promise<IssueItem[]> {
  const branchId = branchInput.parse(options.branchId);
  await authorize(userId, permission, { branchId });
  const q = searchInput.parse(options.q ?? "");
  const { db } = await import("@/server/db/client");
  const inStock = db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(
      stockBalances,
      and(eq(stockBalances.variantId, productVariants.id), eq(stockBalances.branchId, branchId)),
    )
    .where(and(eq(productVariants.productId, products.id), gt(stockBalances.qty, "0")));
  const found = await db
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
        eq(products.type, "GOODS"),
        q === "" ? undefined : ilike(products.name, containing(q)),
        exists(inStock),
      ),
    )
    .orderBy(asc(products.name), asc(products.id))
    .limit(DRAFT_PICKER_MAX);
  if (found.length === 0) return [];

  const subtypes = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      isDefault: productVariants.isDefault,
      isActive: productVariants.isActive,
      inStock: stockBalances.qty,
    })
    .from(productVariants)
    .innerJoin(
      stockBalances,
      and(eq(stockBalances.variantId, productVariants.id), eq(stockBalances.branchId, branchId)),
    )
    .where(
      and(
        inArray(
          productVariants.productId,
          found.map((product) => product.id),
        ),
        gt(stockBalances.qty, "0"),
      ),
    )
    .orderBy(asc(productVariants.name), asc(productVariants.id));

  return found.map(({ isActive, ...product }) => ({
    ...product,
    subtypes: subtypes
      .filter((subtype) => subtype.productId === product.id)
      .map((subtype) => ({
        id: subtype.id,
        name: subtype.isDefault ? null : subtype.name,
        inStock: subtype.inStock,
        inactive: !isActive || !subtype.isActive,
      })),
  }));
}
