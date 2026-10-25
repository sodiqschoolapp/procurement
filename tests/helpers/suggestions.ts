import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { auditLog, branches, catalogSuggestions, files } from "@/server/db/schema";

// A product suggestion sent before 25 October 2026, as suggestProduct wrote it: its PENDING row
// and its `suggestion.create` audit row in one transaction (04-catalogs.md rule 8: "Suggestions
// sent before 25 October 2026 are decided as before ... no new ones are sent"; plan of 1.12b,
// decided item 3, Look first). The action is gone; the tests of the add, the decline, the lists
// and the photo start from such a row.

export type Suggested = { id: string; branchId: string; name: string };

export async function insertSuggestion(
  userId: string,
  branchId: string,
  input: {
    name?: string;
    unitText?: string;
    note?: string | null;
    photoFileId?: string | null;
  } = {},
): Promise<Suggested> {
  const name = input.name ?? `Taklif ${randomUUID().slice(0, 8)}`;
  const unitText = input.unitText ?? "dona";
  const note = input.note ?? null;
  const photoFileId = input.photoFileId ?? null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(catalogSuggestions)
      .values({
        branchId,
        suggestedBy: userId,
        name,
        unitText,
        photoFileId,
        note,
        status: "PENDING",
        clientKey: randomUUID(),
        createdAt: now(),
      })
      .returning({
        id: catalogSuggestions.id,
        branchId: catalogSuggestions.branchId,
        name: catalogSuggestions.name,
      });
    const [branch] = await tx
      .select({ code: branches.code })
      .from(branches)
      .where(eq(branches.id, branchId));
    const photo = photoFileId
      ? ((
          await tx.select({ name: files.originalName }).from(files).where(eq(files.id, photoFileId))
        )[0]?.name ?? null)
      : null;
    await tx.insert(auditLog).values({
      actorId: userId,
      action: "suggestion.create",
      entity: "catalog_suggestions",
      entityId: row!.id,
      before: null,
      after: {
        branchId,
        branch: branch?.code ?? "",
        name,
        unitText,
        note,
        photoFileId,
        photo,
        status: "PENDING",
      },
      createdAt: now(),
    });
    return row!;
  });
}
