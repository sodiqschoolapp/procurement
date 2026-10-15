import { type SQL, sql } from "drizzle-orm";

import type {
  ImportError,
  ImportedDepartment,
  ImportedProduct,
  PriceRowName,
} from "@/domain/imports";
import type { Executor } from "@/server/authorize";

// What only the database knows about the rows of an import (04-catalogs.md rules 2, 3, 7; plan of
// 1.10, decisions 6 and 7): the category, measure, company and branch each row names must exist and
// be active, and a new product's or department's name must not be held already, by an active or an
// inactive entry (D41; plan review of 1.10, correction 2). One query per table, never one per row
// (developer-rules.md rule 12). Names are compared with the unique indexes' own expression, in the
// database, never in JavaScript (as refuseTaken in catalog-entries.ts).
//
// The preview runs it without locks; the save runs it again inside its transaction with `lock`,
// under the tables' advisory locks, and every entry it names is held FOR SHARE until the commit, so
// a deactivation (FOR UPDATE) waits or is seen (as refuseInactive in products.ts).

/** The text as the unique indexes compare it. */
function compared(value: SQL) {
  return sql`lower(regexp_replace(btrim(${value}), '\\s+', ' ', 'g'))`;
}

function textArray(values: readonly string[]) {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

type Match = { typed: string; id: string; isActive: boolean };

/** Each typed name with the entries it matches; `lockOf` the table alias to hold FOR SHARE. */
async function matches(
  tx: Executor,
  typed: readonly string[],
  from: SQL,
  on: SQL,
  lockOf: string,
  lock: boolean,
): Promise<Map<string, Match[]>> {
  const found = new Map<string, Match[]>();
  const distinct = [...new Set(typed)];
  if (distinct.length === 0) return found;
  const result = await tx.execute<{ typed: string; id: string; is_active: boolean }>(
    sql`select t.v as typed, e.id, e.is_active from unnest(${textArray(distinct)}) as t(v)
      join ${from} e on ${on}${lock ? sql.raw(` for share of ${lockOf}`) : sql``}`,
  );
  for (const row of result.rows) {
    const list = found.get(row.typed) ?? [];
    if (!list.some((match) => match.id === row.id)) {
      list.push({ typed: row.typed, id: row.id, isActive: row.is_active });
    }
    found.set(row.typed, list);
  }
  return found;
}

/** The one active entry a name matches, or the error of the row. */
function resolve(
  found: Map<string, Match[]>,
  typed: string,
  error: Omit<ImportError, "kind">,
  errors: ImportError[],
  inactive: ImportError["kind"] = "inactive",
): string | null {
  const list = found.get(typed) ?? [];
  if (list.length === 0) errors.push({ ...error, kind: "unknown" });
  else if (list.length > 1) errors.push({ ...error, kind: "ambiguous" });
  else if (!list[0]!.isActive) errors.push({ ...error, kind: inactive });
  else return list[0]!.id;
  return null;
}

/** The ids a product row's names resolve to. */
export type ProductRefs = { categoryId: string; unitId: string; defaultCompanyId: string | null };

/**
 * Checks the products of an import against the catalog. Returns the errors, and, when there is
 * none, the ids each product's category, measure and company resolve to, in the products' order.
 */
export async function checkProductImport(
  tx: Executor,
  products: readonly ImportedProduct[],
  options: { lock: boolean },
): Promise<{ errors: ImportError[]; refs: ProductRefs[] }> {
  const { lock } = options;
  const filled = (values: (string | null)[]) => values.filter((value): value is string => !!value);
  const v = sql.raw("t.v");
  const categories = await matches(
    tx,
    filled(products.map((product) => product.category)),
    sql.raw("categories"),
    sql`${compared(sql.raw("e.name"))} = ${compared(v)}`,
    "e",
    lock,
  );
  // A measure by its name or its short name: one cell may fit two measures (plan of 1.10,
  // decision 7; spec review of the plan, Should fix 4).
  const units = await matches(
    tx,
    filled(products.map((product) => product.measure)),
    sql.raw("units"),
    sql`(${compared(sql.raw("e.name"))} = ${compared(v)} or ${compared(sql.raw("e.short_name"))} = ${compared(v)})`,
    "e",
    lock,
  );
  const companies = await matches(
    tx,
    filled(products.map((product) => product.company)),
    sql.raw("companies"),
    sql`${compared(sql.raw("e.name"))} = ${compared(v)}`,
    "e",
    lock,
  );
  const names = products.map((product) => product.name);
  const taken = new Set<string>();
  if (names.length > 0) {
    const result = await tx.execute<{ typed: string }>(
      sql`select t.v as typed from unnest(${textArray(names)}) as t(v)
        where exists (select 1 from products p where ${compared(sql.raw("p.name"))} = ${compared(v)})`,
    );
    for (const row of result.rows) taken.add(row.typed);
  }

  const errors: ImportError[] = [];
  const refs: ProductRefs[] = [];
  for (const product of products) {
    const row = product.row;
    if (taken.has(product.name)) errors.push({ row, column: "name", kind: "taken" });
    const categoryId = product.category
      ? resolve(categories, product.category, { row, column: "category" }, errors)
      : null;
    const unitId = product.measure
      ? resolve(units, product.measure, { row, column: "measure" }, errors)
      : null;
    const defaultCompanyId = product.company
      ? resolve(companies, product.company, { row, column: "company" }, errors)
      : null;
    if (categoryId && unitId) refs.push({ categoryId, unitId, defaultCompanyId });
  }
  return { errors, refs: errors.length === 0 ? refs : [] };
}

/**
 * Checks the departments of an import: the branch by its code must exist and be active (decisions
 * 1.6 item 3), and the name must not be held in that branch by an active or inactive department
 * (04 rule 3; decisions 1.6 item 5; plan review of 1.10, correction 2). Returns the errors, and,
 * when there is none, each department's branch id in their order.
 */
export async function checkDepartmentImport(
  tx: Executor,
  departments: readonly ImportedDepartment[],
  options: { lock: boolean },
): Promise<{ errors: ImportError[]; branchIds: string[] }> {
  const branches = await matches(
    tx,
    departments.map((department) => department.branch),
    sql.raw("branches"),
    sql`e.code = upper(btrim(t.v))`,
    "e",
    options.lock,
  );
  const taken = new Set<number>();
  if (departments.length > 0) {
    const result = await tx.execute<{ line: number }>(
      sql`select t.line from unnest(
          ${sql`array[${sql.join(
            departments.map((department) => sql`${department.row}`),
            sql`, `,
          )}]::int[]`},
          ${textArray(departments.map((department) => department.branch))},
          ${textArray(departments.map((department) => department.name))}
        ) as t(line, code, name)
        join branches b on b.code = upper(btrim(t.code))
        where exists (select 1 from departments d where d.branch_id = b.id
          and ${compared(sql.raw("d.name"))} = ${compared(sql.raw("t.name"))})`,
    );
    for (const row of result.rows) taken.add(Number(row.line));
  }

  const errors: ImportError[] = [];
  const branchIds: string[] = [];
  for (const department of departments) {
    const row = department.row;
    const branchId = resolve(
      branches,
      department.branch,
      { row, column: "branch" },
      errors,
      "branchInactive",
    );
    if (taken.has(row)) errors.push({ row, column: "name", kind: "taken" });
    if (branchId) branchIds.push(branchId);
  }
  return { errors, branchIds: errors.length === 0 ? branchIds : [] };
}

/** The subtype a price row lands on, with what its `price.add` audit row needs (correction 3). */
export type PriceTarget = {
  variantId: string;
  productId: string;
  product: string;
  referencePrice: bigint | null;
};

/**
 * Checks the new prices of an import (04 rules 1, 3, 4 and 7; plan of 1.11, decisions 6 and 7):
 * each row's product by its name, and its subtype inside that product: a named cell only among the
 * real subtypes (`is_default` false), so a real subtype called "Default" is found and the hidden
 * row never is by its name; an empty cell only the hidden default, which a product has only while
 * it has no real subtypes. Every condition that picks the subtype is on the `product_variants` row,
 * the one locked and read again after a lock wait, so a default made real during the wait is seen
 * (plan review, Should fix 4). With `lock`, the subtypes are held FOR UPDATE in the order of their
 * ids, as addPrice holds its one row, so two imports cannot deadlock. Two rows that land on one
 * subtype are refused, the second naming the first (Should fix 1). Returns the errors, and, when
 * there is none, each price's subtype in their order.
 */
export async function checkPriceImport(
  tx: Executor,
  prices: readonly PriceRowName[],
  options: { lock: boolean },
): Promise<{ errors: ImportError[]; targets: PriceTarget[] }> {
  if (prices.length === 0) return { errors: [], targets: [] };
  const v = sql.raw("t.v");
  const known = new Set<string>();
  const productRows = await tx.execute<{ typed: string }>(
    sql`select t.v as typed from unnest(${textArray(prices.map((price) => price.product))}) as t(v)
      where exists (select 1 from products p where ${compared(sql.raw("p.name"))} = ${compared(v)})`,
  );
  for (const row of productRows.rows) known.add(row.typed);

  const found = await tx.execute<{
    line: number;
    variant_id: string;
    product_id: string;
    product: string;
    reference_price: string | null;
  }>(
    sql`select t.line, pv.id as variant_id, pv.product_id, p.name as product,
        pv.reference_price::text as reference_price
      from unnest(
          ${sql`array[${sql.join(
            prices.map((price) => sql`${price.row}`),
            sql`, `,
          )}]::int[]`},
          ${textArray(prices.map((price) => price.product))},
          ${textArray(prices.map((price) => price.subtype ?? ""))}
        ) as t(line, product, subtype)
        join products p on ${compared(sql.raw("p.name"))} = ${compared(sql.raw("t.product"))}
        join product_variants pv on pv.product_id = p.id and (
          (t.subtype = '' and pv.is_default)
          or (t.subtype <> '' and not pv.is_default
            and ${compared(sql.raw("pv.name"))} = ${compared(sql.raw("t.subtype"))}))
      order by pv.id${options.lock ? sql.raw(" for update of pv") : sql``}`,
  );
  const byLine = new Map<number, PriceTarget>();
  for (const row of found.rows) {
    byLine.set(Number(row.line), {
      variantId: row.variant_id,
      productId: row.product_id,
      product: row.product,
      referencePrice: row.reference_price === null ? null : BigInt(row.reference_price),
    });
  }

  const errors: ImportError[] = [];
  const targets: PriceTarget[] = [];
  const firstRowOf = new Map<string, number>();
  for (const price of prices) {
    const row = price.row;
    const column = price.subtype === null ? "name" : "subtype";
    if (!known.has(price.product)) {
      errors.push({ row, column: "name", kind: "unknown" });
      continue;
    }
    const target = byLine.get(row);
    if (!target) {
      // An empty cell of a product that has subtypes, or a name none of its subtypes has.
      errors.push({
        row,
        column: "subtype",
        kind: price.subtype === null ? "required" : "unknown",
      });
      continue;
    }
    const earlier = firstRowOf.get(target.variantId);
    if (earlier !== undefined) {
      errors.push({ row, column, kind: "duplicateInFile", firstRow: earlier });
      continue;
    }
    firstRowOf.set(target.variantId, row);
    targets.push(target);
  }
  return { errors, targets: errors.length === 0 ? targets : [] };
}
