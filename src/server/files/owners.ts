import { eq } from "drizzle-orm";

import type { Permission, Target } from "@/domain/permissions";
import type { Executor } from "@/server/authorize";
import { catalogSuggestions, orders, productVariants, products } from "@/server/db/schema";

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
// - An owner returns the permission and target that see the record in its current state, and
//   names the owner where only the owner and the Head may see it: a file of a Draft order, which
//   only its owner and the Head see (06-approval-workflow.md, Statuses), returns `data.view` on
//   the order's branch with the order's owner as `draftOwnerId`, which fileForDownload() checks
//   with the draft wall. Not `request.edit`: a Manager whose CREATE_REQUESTS is off still sees
//   his own orders ("can only view orders"; plan of 2.5a, decided item 11, Look first).
// - A file has one holder. The attaching action refuses a file that another record already holds
//   (and its task adds a unique constraint on the file column), so the order of FILE_OWNERS never
//   decides anything.
// - The attaching action takes only a file the caller uploaded and no record holds yet, checked
//   under its lock: a file id from the browser can otherwise carry another person's or another
//   branch's file into the caller's record, and out through it.

export type FileAccess = {
  permission: Permission;
  target?: Target;
  /** The owner of a Draft order that holds the file: behind the draft wall for everyone else. */
  draftOwnerId?: string;
};

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

/**
 * A product suggestion's photo (task 1.12): seen through catalog.suggest on the suggestion's
 * branch, the Head and the Managers of that branch, whatever its status (plan of 1.12, decision 1,
 * Look first). When the Head kept the photo at the add, the new product holds the same file: then
 * it answers catalog.pick, exactly as PRODUCT_PHOTOS does, so the order of FILE_OWNERS still decides
 * nothing (decision 3, Look first). Once that product's photo is dropped or replaced, the file is
 * the suggestion's alone again and back behind its branch.
 */
export const SUGGESTION_PHOTOS: FileOwner = {
  name: "catalog_suggestions.photo_file_id",
  async find(executor, fileId) {
    const [row] = await executor
      .select({ branchId: catalogSuggestions.branchId })
      .from(catalogSuggestions)
      .where(eq(catalogSuggestions.photoFileId, fileId));
    if (!row) return null;
    if (await PRODUCT_PHOTOS.find(executor, fileId)) return { permission: "catalog.pick" };
    return { permission: "catalog.suggest", target: { branchId: row.branchId } };
  },
};

/**
 * An order's extra reference photo (05 field 5; task 2.5a): seen through `data.view` on the
 * order's branch, and while the order is a Draft by its owner and the Head only (06 Statuses; the
 * draft wall; plan of 2.5a, decided item 11, Look first).
 */
export const ORDER_REFERENCE_PHOTOS: FileOwner = {
  name: "orders.reference_photo_file_id",
  async find(executor, fileId) {
    const [row] = await executor
      .select({ branchId: orders.branchId, ownerId: orders.ownerId, status: orders.status })
      .from(orders)
      .where(eq(orders.referencePhotoFileId, fileId));
    if (!row) return null;
    return {
      permission: "data.view",
      target: { branchId: row.branchId },
      ...(row.status === "DRAFT" ? { draftOwnerId: row.ownerId } : {}),
    };
  },
};

export const FILE_OWNERS: readonly FileOwner[] = [
  PRODUCT_PHOTOS,
  SUBTYPE_PHOTOS,
  SUGGESTION_PHOTOS,
  ORDER_REFERENCE_PHOTOS,
];

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
