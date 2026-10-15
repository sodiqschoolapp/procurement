"use server";

import { revalidatePath } from "next/cache";

import {
  IMPORT_FILE_MAX_BYTES,
  type ImportKind,
  type ImportSheet,
  isImportKind,
} from "@/domain/imports";
import {
  type SavedImport,
  importDepartments,
  importProducts,
} from "@/features/catalog/actions/imports";
import { type ImportPreview, previewImport } from "@/features/catalog/queries/imports";
import { runAction } from "@/server/action";
import { type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { AuthorizationError, authorize } from "@/server/authorize";
import { ImportFileError, readSheet } from "@/server/excel";

// The actions of /catalog/import/<kind> (plan of 1.10, "Server actions and queries"): a form with
// `kind`, `file` and, for the save, `clientKey`. The permission is checked before a byte of the
// file is read, so nobody but the Head makes the server unpack a file (plan review of 1.10,
// correction 1; developer-rules.md rules 4 and 13). Then the file is read by its content
// (src/server/excel.ts) and the preview query or the import action runs; the action checks every
// row again in its transaction (decision 5).

type Upload = { kind: ImportKind; fileName: string; sheet: ImportSheet; userId: string };

/** The signed-in Head and the sheet of the uploaded file, or the refusal. */
async function upload(form: FormData): Promise<Upload | { refusal: ActionResult<never> }> {
  const user = await getCurrentUser();
  if (!user) return { refusal: failure("signed_out") };
  try {
    await authorize(user.id, "catalog.manage");
  } catch (error) {
    if (error instanceof AuthorizationError) return { refusal: failure(error.kind) };
    throw error;
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (!isImportKind(kind))
    return { refusal: failure("invalid_input", { kind: "errors.field.notAllowed" }) };
  if (!(file instanceof File) || file.size === 0) {
    return { refusal: failure("invalid_input", { file: "errors.field.required" }) };
  }
  if (file.size > IMPORT_FILE_MAX_BYTES) {
    return { refusal: failure("invalid_input", { file: "errors.field.fileTooLarge" }) };
  }
  try {
    const sheet = await readSheet(new Uint8Array(await file.arrayBuffer()));
    return { kind, fileName: file.name, sheet, userId: user.id };
  } catch (error) {
    if (error instanceof ImportFileError) {
      return { refusal: failure("invalid_input", { file: `errors.field.${error.kind}` }) };
    }
    throw error;
  }
}

/** The preview of a chosen file: its rows and every error. Writes nothing. */
export async function previewImportAction(form: FormData): Promise<ActionResult<ImportPreview>> {
  const read = await upload(form);
  if ("refusal" in read) return read.refusal;
  try {
    return { ok: true, data: await previewImport(read.userId, read.kind, read.sheet) };
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error.kind);
    throw error;
  }
}

/** Saves every row of the file, or none; the same client key twice gives the first (rule 8). */
export async function saveImportAction(form: FormData): Promise<ActionResult<SavedImport>> {
  const read = await upload(form);
  if ("refusal" in read) return read.refusal;
  const input = { clientKey: form.get("clientKey"), fileName: read.fileName, sheet: read.sheet };
  const result =
    read.kind === "products"
      ? await runAction(importProducts, read.userId, input)
      : await runAction(importDepartments, read.userId, input);
  if (!result.ok) return result;
  revalidatePath("/catalog", "layout");
  return { ok: true, data: { importId: result.data.importId, rows: result.data.rows } };
}
