import { eq } from "drizzle-orm";

import type { FileMime } from "@/domain/files";
import { AuthorizationError, authorize } from "@/server/authorize";
import { files } from "@/server/db/schema";
import { type FileOwner, FILE_OWNERS, accessOf } from "@/server/files/owners";

// The file the download route may send (build plan 0.12). The record that holds the file decides
// through authorize() (src/server/files/owners.ts); a file no record holds goes to its uploader
// only (plan of 0.12, decision 5, Look first). Every refusal is "Not found", the same as for an
// id that does not exist, so an id tells nothing about a file (03-roles-and-permissions.md rule 1).

export type DownloadableFile = { storageKey: string; mime: FileMime; originalName: string };

/** The file, or throws AuthorizationError("not_found"). */
export async function fileForDownload(
  userId: string,
  fileId: string,
  owners: readonly FileOwner[] = FILE_OWNERS,
): Promise<DownloadableFile> {
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const [file] = await db
    .select({
      storageKey: files.storageKey,
      mime: files.mime,
      originalName: files.originalName,
      uploadedBy: files.uploadedBy,
    })
    .from(files)
    .where(eq(files.id, fileId));
  if (!file) throw new AuthorizationError("not_found");

  try {
    const access = await accessOf(db, fileId, owners);
    if (access) {
      await authorize(userId, access.permission, access.target);
    } else {
      await authorize(userId, "file.upload");
      if (file.uploadedBy !== userId) throw new AuthorizationError("not_found");
    }
  } catch (error) {
    if (error instanceof AuthorizationError) throw new AuthorizationError("not_found");
    throw error;
  }
  return { storageKey: file.storageKey, mime: file.mime, originalName: file.originalName };
}
