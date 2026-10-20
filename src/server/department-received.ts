import { type AnyColumn, type SQL, sql } from "drizzle-orm";

import type { Executor } from "./authorize";

// What one department of one branch holds of each subtype, and the cost its items left at (09-
// warehouse.md, Other documents: Return from a department; plan of 5.6, decided items 1 and 2,
// Look first). The one reader both the return action and the return form's search use, so the
// screen warns on the number the server refuses on (developer-rules.md rule 1). None of these
// authorizes: the caller has authorized its branch and checked the department is of it.

export type DepartmentScope = {
  branchId: string;
  departmentId: string;
  variantIds: readonly string[];
};

/** The department of a branch whose received amounts are read. */
export type DepartmentOf = { branchId: string; departmentId: string };

/**
 * The department's net received quantity per subtype, as rows (`variant_id`, `received`): every
 * movement on the lines of its ISSUE and RETURN documents in the branch, REVERSAL rows included,
 * summed and negated (correction 2 of the plan review). A reversal is written on the line of the
 * movement it undoes (reverseDocument() of ./stock-documents.ts), so a reversed issue or return
 * nets to 0 without a status filter. Below 0 once it returned more than it got. The sum is
 * PostgreSQL's numeric: no JavaScript arithmetic on a quantity. The one expression of the amount,
 * read by departmentReceived() and departmentHoldsSql() (plan of 7.4b, review of the plan, should
 * fix 1).
 */
function receivedRows(scope: DepartmentOf): SQL {
  return sql`
    select m.variant_id, -sum(m.qty_delta) as received
    from stock_movements m
    join stock_document_lines l on l.id = m.document_line_id
    join stock_documents d on d.id = l.document_id
    where d.department_id = ${scope.departmentId} and d.branch_id = ${scope.branchId}
      and d.type in ('ISSUE', 'RETURN') and m.branch_id = ${scope.branchId}
    group by m.variant_id`;
}

/**
 * The department's net received quantity per subtype, numeric(14,3) text (receivedRows()). A
 * subtype it never had is "0".
 */
export async function departmentReceived(
  executor: Executor,
  scope: DepartmentScope,
): Promise<Map<string, string>> {
  const received = new Map(scope.variantIds.map((id) => [id, "0"]));
  if (scope.variantIds.length === 0) return received;
  const ids = sql.join(
    scope.variantIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const found = await executor.execute<{ variant_id: string; received: string }>(sql`
    select r.variant_id, r.received::text as received
    from (${receivedRows(scope)}) r
    where r.variant_id in (${ids})`);
  for (const row of found.rows) received.set(row.variant_id, row.received);
  return received;
}

/**
 * Whether the department holds the subtype in `variant` (a column of the caller's query): its net
 * received amount above 0, departmentHolds() of src/domain/stock-documents.ts in SQL, so the
 * return form lists an inactive item exactly when the return action takes it (04 rule 2; plan of
 * 7.4b, decided item 4, Look first).
 */
export function departmentHoldsSql(scope: DepartmentOf, variant: SQL | AnyColumn): SQL {
  return sql`exists (select 1 from (${receivedRows(scope)}) r
    where r.variant_id = ${variant} and r.received > 0)`;
}

/**
 * The cost a return comes in at if the stock is empty (decided item 1, Look first): the unit cost
 * of the department's newest ISSUE movement of the subtype in the branch that no REVERSAL undid;
 * 0 when there is none. Whole so'm.
 */
export async function departmentIssueCost(
  executor: Executor,
  scope: DepartmentScope,
): Promise<Map<string, bigint>> {
  const costs = new Map(scope.variantIds.map((id) => [id, 0n]));
  if (scope.variantIds.length === 0) return costs;
  const ids = sql.join(
    scope.variantIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const found = await executor.execute<{ variant_id: string; unit_cost: string }>(sql`
    select distinct on (m.variant_id) m.variant_id, m.unit_cost::text as unit_cost
    from stock_movements m
    join stock_document_lines l on l.id = m.document_line_id
    join stock_documents d on d.id = l.document_id
    where d.department_id = ${scope.departmentId} and d.branch_id = ${scope.branchId}
      and d.type = 'ISSUE' and m.type = 'ISSUE' and m.branch_id = ${scope.branchId}
      and m.variant_id in (${ids})
      and not exists (select 1 from stock_movements r where r.reverses_movement_id = m.id)
    order by m.variant_id, m.seq desc`);
  for (const row of found.rows) costs.set(row.variant_id, BigInt(row.unit_cost));
  return costs;
}
