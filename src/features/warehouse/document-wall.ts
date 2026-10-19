import { type SQL, and, eq, or } from "drizzle-orm";

import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { stockDocuments } from "@/server/db/schema";

/**
 * The branch wall of a warehouse document, inside the SQL (03 rule 1; developer-rules.md rule 4):
 * a document of one of the user's branches, or a transfer to one of them (09 Other documents,
 * Transfer: "The receiving Manager enters what really arrived"; plan of 7.2, decided item 3, Look
 * first). The Head sees every branch: no condition. The one wall of the list, the page and the
 * note.
 */
export function documentWall(actor: Actor): SQL | undefined {
  const own = branchFilter(actor, stockDocuments.branchId);
  if (!own) return undefined;
  return or(
    own,
    and(eq(stockDocuments.type, "TRANSFER"), branchFilter(actor, stockDocuments.toBranchId)),
  );
}
