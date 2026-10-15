import { eq } from "drizzle-orm";

import type { Permission, Target } from "@/domain/permissions";
import type { Executor } from "@/server/authorize";
import { productVariants, products } from "@/server/db/schema";

// Who may download a file: the record it belongs to decides (build plan 0.12: the download route
// "calls authorize() for the record the file belongs to; each later task that attaches files adds
// its check"). Each task that points a table at `files` (purchase_files, products.photo_file_id,
// catalog_suggestions.photo_file_id, money_entries.file_id, …) adds one owner here, with a
// database test of its own: it finds the record that holds the file and names the permission and
// the branch to authorize. A file no owner finds is held by no record yet; only its uploader may
// have it (plan of 0.12, decision 5, Look first).
//
// The contract every owner and every attaching action keeps (permission review of 0.12, Should
// fix 1 to 3):
// - An owner returns the permission and target that see the record in its current state, with
//   the owner where only the owner may see it: a file of a Draft request, which only its owner
//   and the Head see (06-approval-workflow.md, Statuses), returns `request.edit` with the
//   request's `ownerId`, not `data.view` on the branch.
// - A file has one holder. The attaching action refuses a file that another record already holds
//   (and its task adds a unique constraint on the file column), so the order of FILE_OWNERS never
//   decides anything.
// - The attaching action takes only a file the caller uploaded and no record holds yet, checked
//   under its lock: a file id from the browser can otherwise carry another person's or another
//   branch's file into the caller's record, and out through it.

export type FileAccess = { permission: Permission; target?: Target };

export type FileOwner = {
  /** For the log and the tests. */
  name: string;
  /** The permission and target of the record that holds the file, or `null` when none does. */
  find(executor: Executor, fileId: string): Promise<FileAccess | null>;
};

/**
 * A product's photo (task 1.7): seen by every role through catalog.pick, the product active or not
 * (04-catalogs.md: "everyone else picks from them"; rule 2: inactive entries stay visible in old
 * records; plan of 1.7, decision 5, Look first). A catalog holds no branch data.
 */
export const PRODUCT_PHOTOS: FileOwner = {
  name: "products.photo_file_id",
  async find(executor, fileId) {
    const [row] = await executor
      .select({ id: products.id })
      .from(products)
      .where(eq(products.photoFileId, fileId));
    return row ? { permission: "catalog.pick" } : null;
  },
};

/**
 * A subtype's own photo (task 1.8): seen by every role through catalog.pick, as a product's photo
 * (plan of 1.8, decision 8; progress 1.7, "For 1.8"). A catalog holds no branch data.
 */
export const SUBTYPE_PHOTOS: FileOwner = {
  name: "product_variants.photo_file_id",
  async find(executor, fileId) {
    const [row] = await executor
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.photoFileId, fileId));
    return row ? { permission: "catalog.pick" } : null;
  },
};

export const FILE_OWNERS: readonly FileOwner[] = [PRODUCT_PHOTOS, SUBTYPE_PHOTOS];

/** The access of the first record that holds the file, or `null` for a file no record holds. */
export async function accessOf(
  executor: Executor,
  fileId: string,
  owners: readonly FileOwner[] = FILE_OWNERS,
): Promise<FileAccess | null> {
  for (const owner of owners) {
    const access = await owner.find(executor, fileId);
    if (access) return access;
  }
  return null;
}
