import { type SQL, sql } from "drizzle-orm";

import type { ImportError, ImportedDepartment, ImportedProduct } from "@/domain/imports";
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
