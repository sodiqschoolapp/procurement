import { eq } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { FILE_MIMES, MAX_FILE_BYTES } from "@/domain/files";
import { GLOBAL_TARGET, defineAction } from "@/server/action";
import { now } from "@/server/clock";
import { files } from "@/server/db/schema";

// The row of an upload (build plan 0.12). Called by the upload route (src/app/files/route.ts)
// after its objects are written (plan of 0.12, decision 15), through the wrapper's global form
// with a safe repeat (decision 6, Look first): the same client key twice returns the first file,
// and only to the person who uploaded it.

export const uploadFileInput = z.object({
  clientKey: z.string().refine(isClientKey),
  storageKey: z.uuid(),
  originalName: z
    .string()
    .refine((name) => name.trim() === name && Array.from(name).length >= 1)
    .refine((name) => Array.from(name).length <= 255),
  mime: z.enum(FILE_MIMES),
  sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
});

export const uploadFile = defineAction({
  name: "uploadFile",
  permission: "file.upload",
  input: uploadFileInput,
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    async find(tx, clientKey) {
      const [row] = await tx
        .select({ id: files.id, uploadedBy: files.uploadedBy })
        .from(files)
        .where(eq(files.clientKey, clientKey));
      return row ? { result: { id: row.id }, userId: row.uploadedBy, branchId: null } : null;
    },
  },
  async write({ tx, input, userId }) {
    const [row] = await tx
      .insert(files)
      .values({
        storageKey: input.storageKey,
        originalName: input.originalName,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        uploadedBy: userId,
        clientKey: input.clientKey,
        createdAt: now(),
      })
      .returning({ id: files.id });
    return { id: row!.id };
  },
});
