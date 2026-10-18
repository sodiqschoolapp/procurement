import { sql } from "drizzle-orm";

import type { ImportError, ImportedStock } from "@/domain/imports";
import { directEntryLineRefusal } from "@/domain/stock-documents";
import { compared, textArray } from "@/features/catalog/imports/check";
import type { Executor } from "@/server/authorize";

// What only the database knows about the rows of a stock import (09 Direct entry by the Head 1;
// 04-catalogs.md rules 1, 3 and 7; plan of 5.9): each row's product by its name and its subtype
// inside that product, as the prices import finds them (1.11 decision 6: a named cell only among
// the real subtypes, an empty cell only the hidden default); then the rules of a direct-entry line
// (directEntryLineRefusal(): goods, active, the quantity by the measure) and its cost, typed or the
// subtype's reference price (decided item 1, Look first). One query per table (developer-rules.md
// rule 12).
//
// With `lock` (the save), the products are found and held FOR SHARE in the order of their ids in
// one query, then the subtypes of those products in the order of theirs, with every condition that
// picks them on the locked rows: the lock order of enterStockDirectly, and a product renamed while
// the save waited is no longer found (review of the plan, must fix 3). The preview runs it without
// locks; the save is the gate.

/** One line to enter: the row it came from, its subtype, its quantity and its cost. */
export type StockImportLine = { row: number; variantId: string; qty: string; cost: bigint };

export async function checkStockImport(
  tx: Executor,
  rows: readonly ImportedStock[],
  options: { lock: boolean },
): Promise<{ errors: ImportError[]; lines: StockImportLine[] }> {
  if (rows.length === 0) return { errors: [], lines: [] };
  const lock = (of: string) => (options.lock ? sql.raw(` for share of ${of}`) : sql``);
  const found = await tx.execute<{ typed: string; id: string }>(
    sql`select t.v as typed, p.id
      from unnest(${textArray(rows.map((row) => row.product))}) as t(v)
        join products p on ${compared(sql.raw("p.name"))} = ${compared(sql.raw("t.v"))}
      order by p.id${lock("p")}`,
  );
  const productOf = new Map(found.rows.map((row) => [row.typed, row.id]));
  const productIds = [...new Set(found.rows.map((row) => row.id))];

  const subtypes =
    productIds.length === 0
      ? []
      : (
          await tx.execute<{
            line: number;
            variant_id: string;
            is_active: boolean;
            product_active: boolean;
            type: "GOODS" | "SERVICE";
            allow_decimal: boolean;
            reference_price: string | null;
          }>(
            sql`select t.line, pv.id as variant_id, pv.is_active, p.is_active as product_active,
                p.type, u.allow_decimal, pv.reference_price::text as reference_price
              from unnest(
                  ${sql`array[${sql.join(
                    rows.map((row) => sql`${row.row}`),
                    sql`, `,
                  )}]::int[]`},
                  ${textArray(rows.map((row) => row.product))},
                  ${textArray(rows.map((row) => row.subtype ?? ""))}
                ) as t(line, product, subtype)
                join products p on ${compared(sql.raw("p.name"))} = ${compared(sql.raw("t.product"))}
                  and p.id = any(${sql`array[${sql.join(
                    productIds.map((id) => sql`${id}`),
                    sql`, `,
                  )}]::uuid[]`})
                join units u on u.id = p.unit_id
                join product_variants pv on pv.product_id = p.id and (
                  (t.subtype = '' and pv.is_default)
                  or (t.subtype <> '' and not pv.is_default
                    and ${compared(sql.raw("pv.name"))} = ${compared(sql.raw("t.subtype"))}))
              order by pv.id${lock("pv")}`,
          )
        ).rows;
  const byLine = new Map(subtypes.map((row) => [Number(row.line), row]));

  const errors: ImportError[] = [];
  const lines: StockImportLine[] = [];
  const firstRowOf = new Map<string, number>();
  for (const entry of rows) {
    const row = entry.row;
    const named = entry.subtype === null ? "name" : "subtype";
    if (!productOf.has(entry.product)) {
      errors.push({ row, column: "name", kind: "unknown" });
      continue;
    }
    const subtype = byLine.get(row);
    if (!subtype) {
      // An empty cell of a product that has subtypes, or a name none of its subtypes has.
      errors.push({
        row,
        column: "subtype",
        kind: entry.subtype === null ? "required" : "unknown",
      });
      continue;
    }
    const earlier = firstRowOf.get(subtype.variant_id);
    if (earlier !== undefined) {
      errors.push({ row, column: named, kind: "duplicateInFile", firstRow: earlier });
      continue;
    }
    firstRowOf.set(subtype.variant_id, row);
    const refusal = directEntryLineRefusal(
      {
        isActive: subtype.is_active,
        productActive: subtype.product_active,
        type: subtype.type,
        allowsDecimals: subtype.allow_decimal,
      },
      entry.qty,
    );
    if (refusal) {
      errors.push({ row, column: refusal.field === "qty" ? "qty" : named, kind: refusal.kind });
      continue;
    }
    // An empty cost takes the subtype's reference price (09 Direct entry, Lines).
    const cost =
      entry.cost ?? (subtype.reference_price === null ? null : BigInt(subtype.reference_price));
    if (cost === null) {
      errors.push({ row, column: "cost", kind: "required" });
      continue;
    }
    lines.push({ row, variantId: subtype.variant_id, qty: entry.qty, cost });
  }
  return { errors, lines: errors.length === 0 ? lines : [] };
}
