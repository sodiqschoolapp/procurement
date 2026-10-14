import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { files } from "@/server/db/schema";
import type { FileOwner } from "@/server/files/owners";

import { insertBranch } from "../../../tests/helpers/branches";
import { setClock } from "../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../tests/helpers/users";
import { uploadFile } from "./actions/upload-file";
import { fileForDownload } from "./queries/file-for-download";

// uploadFile and fileForDownload in the permission matrix (03-roles-and-permissions.md; plan of
// 0.12, decisions 4 and 5, Look first), and the owner registry a later task fills (build plan
// 0.12: "each later task that attaches files adds its check").

function uploadInput() {
  return {
    clientKey: newClientKey(),
    storageKey: randomUUID(),
    originalName: "chek.jpg",
    mime: "image/jpeg" as const,
    sizeBytes: 1200,
  };
}

/** A file row of a user, as the upload route leaves it (no object is needed to decide access). */
async function fileOf(userId: string): Promise<string> {
  const [row] = await db
    .insert(files)
    .values({ ...uploadInput(), uploadedBy: userId, createdAt: now() })
    .returning({ id: files.id });
  return row!.id;
}

/** The wrapper's answer as the matrix reads it. */
function answer(result: Awaited<ReturnType<typeof runAction>>) {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("uploadFile", {
  permission: "file.upload",
  async run({ user }) {
    answer(await runAction(uploadFile, user.id, uploadInput()));
  },
});

describePermissionMatrix("fileForDownload of one's own upload", {
  permission: "file.upload",
  async run({ user }) {
    await fileForDownload(user.id, await fileOf(user.id));
  },
});

describe("uploadFile (build plan 0.12)", () => {
  it("writes the row with the clock's moment and the uploader (developer-rules.md rule 10)", async () => {
    setClock("2026-10-14T09:30:00Z");
    const finance = await insertUser("FINANCE");
    const input = uploadInput();
    const result = await runAction(uploadFile, finance.id, input);
    expect(result).toMatchObject({ ok: true });
    const [row] = await db.select().from(files).where(eq(files.clientKey, input.clientKey));
    expect(row).toMatchObject({
      uploadedBy: finance.id,
      storageKey: input.storageKey,
      createdAt: new Date("2026-10-14T09:30:00Z"),
    });
  });

  it("refuses a name with spaces around it or over 255 characters: the route trims and cuts first", async () => {
    const head = await insertUser("HEAD");
    for (const originalName of [" chek.jpg", "a".repeat(256), ""]) {
      const result = await runAction(uploadFile, head.id, { ...uploadInput(), originalName });
      expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
  });
});

describe("a file held by a record: the record decides (plan of 0.12, decision 5, Look first)", () => {
  /** A sample owner, as a later task adds one: the file belongs to a record of `branchId`. */
  function ownerIn(branchId: string, fileId: string): FileOwner {
    return {
      name: "sample",
      async find(_executor, id) {
        return id === fileId ? { permission: "data.view", target: { branchId } } : null;
      },
    };
  }

  it("a user of the record's branch gets it, also when someone else uploaded it; another branch gets Not found", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const uploader = await insertUser("MANAGER", { branches: [own.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const elsewhere = await insertUser("FINANCE", { branches: [other.id] });
    const fileId = await fileOf(uploader.id);
    const owners = [ownerIn(own.id, fileId)];

    await expect(fileForDownload(principal.id, fileId, owners)).resolves.toMatchObject({
      mime: "image/jpeg",
    });
    await expect(fileForDownload(elsewhere.id, fileId, owners)).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("once a record holds it, the uploader alone is no longer enough", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const uploader = await insertUser("MANAGER", { branches: [own.id] });
    const fileId = await fileOf(uploader.id);

    await expect(
      fileForDownload(uploader.id, fileId, [ownerIn(other.id, fileId)]),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("an inactive uploader gets Not found for their own file", async () => {
    const uploader = await insertUser("MANAGER", { isActive: false });
    const fileId = await fileOf(uploader.id);
    await expect(fileForDownload(uploader.id, fileId)).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
