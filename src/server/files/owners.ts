import type { Permission, Target } from "@/domain/permissions";
import type { Executor } from "@/server/authorize";

// Who may download a file: the record it belongs to decides (build plan 0.12: the download route
// "calls authorize() for the record the file belongs to; each later task that attaches files adds
// its check"). Each task that points a table at `files` (purchase_files, products.photo_file_id,
// catalog_suggestions.photo_file_id, money_entries.file_id, …) adds one owner here, with a
// database test of its own: it finds the record that holds the file and names the permission and
// the branch to authorize. A file no owner finds is held by no record yet; only its uploader may
// have it (plan of 0.12, decision 5, Look first).

export type FileAccess = { permission: Permission; target?: Target };

export type FileOwner = {
  /** For the log and the tests. */
  name: string;
  /** The permission and target of the record that holds the file, or `null` when none does. */
  find(executor: Executor, fileId: string): Promise<FileAccess | null>;
};

/** Empty in 0.12: no table points to `files` yet. */
export const FILE_OWNERS: readonly FileOwner[] = [];

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
