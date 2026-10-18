import { sql } from "drizzle-orm";
import * as z from "zod";

import {
  type DocumentStatus,
  type DocumentType,
  overReturn,
  reverseAllows,
} from "@/domain/stock-documents";
import { AuthorizationError, authorize } from "@/server/authorize";
import { departmentReceived } from "@/server/department-received";
import { readSnapshot } from "@/server/read-snapshot";

// What the Reverse dialog shows before the press (09-warehouse.md, Movement types, last paragraph;
// 11-screens-and-ux.md rule 6, "state the result"; plan of 5.7, decided item 6): the document's
// number, department and every line, since one press reverses them all. Under
// `stock.return_reverse` on the document's branch, read from the database; another branch or an
// unknown id is "Not found" (03 rule 1); a document reverseAllows() refuses is "forbidden". On an issue, a line more than the department now holds
// carries that amount: the dialog warns, as a return over what was received does (09 Other
// documents, Return; review of the plan, correction 1, Look first), and the reason is the comment.

export type ReverseLine = {
  id: string;
  variantId: string;
  productName: string;
  /** null for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  /** numeric(14,3) text as stored. */
  qty: string;
  unitShortName: string;
  /** On an issue whose line is more than the department holds: what it holds; else null. */
  held: string | null;
};

export type ReversePreview = {
  id: string;
  number: string;
  type: DocumentType;
  status: DocumentStatus;
  departmentName: string | null;
  lines: ReverseLine[];
};

const idInput = z.uuid();

/** The dialog's preview of one document. Throws AuthorizationError as authorize() does. */
export async function getReversePreview(
  userId: string,
  documentId: string,
): Promise<ReversePreview> {
  const id = idInput.safeParse(documentId);
  if (!id.success) throw new AuthorizationError("not_found");

  return readSnapshot(async (db) => {
    const found = await db.execute<{
      number: string;
      type: DocumentType;
      status: DocumentStatus;
      branch_id: string;
      department_id: string | null;
      department_name: string | null;
      created_by: string;
    }>(sql`
      select d.number, d.type, d.status, d.branch_id, d.department_id, d.created_by,
        dep.name as department_name
      from stock_documents d
      left join departments dep on dep.id = d.department_id
      where d.id = ${id.data}`);
    const document = found.rows[0];
    if (!document) throw new AuthorizationError("not_found");
    const actor = await authorize(
      userId,
      "stock.return_reverse",
      { branchId: document.branch_id },
      db,
    );
    // The action's own who (reverseAllows()): no preview of a reverse it would refuse
    // (permission review of 5.7, should-fix 1).
    if (!reverseAllows(actor, { type: document.type, createdBy: document.created_by })) {
      throw new AuthorizationError("forbidden");
    }

    const lines = await db.execute<{
      id: string;
      variant_id: string;
      product_name: string;
      variant_name: string;
      is_default: boolean;
      qty: string;
      unit_short_name: string;
    }>(sql`
      select l.id, l.variant_id, p.name as product_name, v.name as variant_name,
        v.is_default, l.qty::text as qty, u.short_name as unit_short_name
      from stock_document_lines l
      join product_variants v on v.id = l.variant_id
      join products p on p.id = v.product_id
      join units u on u.id = p.unit_id
      where l.document_id = ${id.data}
      order by p.name, v.name, l.id`);

    const received =
      document.type === "ISSUE" && document.department_id
        ? await departmentReceived(db, {
            branchId: document.branch_id,
            departmentId: document.department_id,
            variantIds: lines.rows.map((line) => line.variant_id),
          })
        : null;

    return {
      id: id.data,
      number: document.number,
      type: document.type,
      status: document.status,
      departmentName: document.department_name,
      lines: lines.rows.map((line) => {
        const holds = received?.get(line.variant_id) ?? null;
        return {
          id: line.id,
          variantId: line.variant_id,
          productName: line.product_name,
          subtypeName: line.is_default ? null : line.variant_name,
          qty: line.qty,
          unitShortName: line.unit_short_name,
          held: holds !== null && overReturn(line.qty, holds) ? holds : null,
        };
      }),
    };
  });
}
