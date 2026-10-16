import { eq } from "drizzle-orm";

import { IMAGE_MIMES } from "@/domain/files";
import { ActionError } from "@/server/action";
import type { Executor } from "@/server/authorize";
import { files } from "@/server/db/schema";
import { accessOf } from "@/server/files/owners";

// The photo of a catalog entry: a product's (1.7) and a subtype's (1.8), and the extra reference
// photo of an order (2.5a), named by its field. One check for all, so a file is held by one record
// only (src/server/files/owners.ts contract; plan of 1.7, decision 10; plan of 1.8, decision 8).

/**
 * A photo is an image uploaded by the actor that no record holds yet (owners.ts contract). The
 * file row is locked FOR UPDATE, so two records attaching the same file cannot both pass. An
 * unknown file, another person's, or one already held by a product or a subtype is "not allowed",
 * alike.
 */
export async function refusePhoto(
  tx: Executor,
  userId: string,
  fileId: string,
  field = "photoFileId",
) {
  const [file] = await tx
    .select({ uploadedBy: files.uploadedBy, mime: files.mime })
    .from(files)
    .where(eq(files.id, fileId))
    .for("update");
  if (!file || file.uploadedBy !== userId || (await accessOf(tx, fileId)) !== null) {
    throw new ActionError("invalid_input", { [field]: "errors.field.notAllowed" });
  }
  if (!(IMAGE_MIMES as readonly string[]).includes(file.mime)) {
    throw new ActionError("invalid_input", { [field]: "errors.field.notAPhoto" });
  }
}

/** The file name a history row keeps beside a photo's id (plan of 1.7, decision 11). */
export async function fileNameOf(tx: Executor, id: string) {
  const [row] = await tx.select({ name: files.originalName }).from(files).where(eq(files.id, id));
  return row?.name ?? null;
}
