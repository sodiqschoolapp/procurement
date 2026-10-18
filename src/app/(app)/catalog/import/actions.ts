"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import {
  IMPORT_FILE_MAX_BYTES,
  IMPORT_PERMISSIONS,
  type ImportKind,
  type ImportSheet,
  isImportKind,
} from "@/domain/imports";
import {
  type SavedImport,
  importDepartments,
  importPrices,
  importProducts,
} from "@/features/catalog/actions/imports";
import { type ImportPreview, previewImport } from "@/features/catalog/queries/imports";
import { importStock } from "@/features/warehouse/actions/import-stock";
import { runAction } from "@/server/action";
import { type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { AuthorizationError, authorize } from "@/server/authorize";
import { ImportFileError, readSheet } from "@/server/excel";

// The actions of /catalog/import/<kind> (plan of 1.10, "Server actions and queries"): a form with
// `kind`, `file` and, for the save, `clientKey`. The kind is read first, then its own permission
// (IMPORT_PERMISSIONS; plan of 1.11, decision 4), before a byte of the file is read, so nobody but
// the Head makes the server unpack a file (plan review of 1.10, correction 1; developer-rules.md
// rules 4 and 13). Then the file is read by its content
// (src/server/excel.ts) and the preview query or the import action runs; the action checks every
// row again in its transaction (decision 5). A stock import's form carries `branchId` too, and
// its permission is asked of that branch, still before the file is read (plan of 5.9).

type Upload = {
  kind: ImportKind;
  fileName: string;
  sheet: ImportSheet;
  userId: string;
  branchId?: string;
};

const branchInput = z.uuid();

/** The signed-in Head and the sheet of the uploaded file, or the refusal. */
async function upload(form: FormData): Promise<Upload | { refusal: ActionResult<never> }> {
  const user = await getCurrentUser();
  if (!user) return { refusal: failure("signed_out") };
  const kind = form.get("kind");
  if (!isImportKind(kind))
    return { refusal: failure("invalid_input", { kind: "errors.field.notAllowed" }) };
  let branchId: string | undefined;
  if (kind === "stock") {
    const parsed = branchInput.safeParse(form.get("branchId"));
    if (!parsed.success) {
      return { refusal: failure("invalid_input", { branchId: "errors.field.required" }) };
    }
    branchId = parsed.data;
  }
  try {
    if (branchId) await authorize(user.id, IMPORT_PERMISSIONS.stock, { branchId });
    else await authorize(user.id, IMPORT_PERMISSIONS[kind]);
  } catch (error) {
    if (error instanceof AuthorizationError) return { refusal: failure(error.kind) };
    throw error;
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { refusal: failure("invalid_input", { file: "errors.field.required" }) };
  }
  if (file.size > IMPORT_FILE_MAX_BYTES) {
    return { refusal: failure("invalid_input", { file: "errors.field.fileTooLarge" }) };
  }
  try {
    const sheet = await readSheet(new Uint8Array(await file.arrayBuffer()));
    return { kind, fileName: file.name, sheet, userId: user.id, branchId };
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
    return {
      ok: true,
      data: await previewImport(read.userId, read.kind, read.sheet, read.branchId),
    };
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
  if (read.kind === "stock") {
    const saved = await runAction(importStock, read.userId, { ...input, branchId: read.branchId });
    if (!saved.ok) return saved;
    revalidatePath("/warehouse", "layout");
    return {
      ok: true,
      data: { importId: saved.data.importId, rows: saved.data.rows, numbers: saved.data.numbers },
    };
  }
  const result =
    read.kind === "products"
      ? await runAction(importProducts, read.userId, input)
      : read.kind === "departments"
        ? await runAction(importDepartments, read.userId, input)
        : await runAction(importPrices, read.userId, input);
  if (!result.ok) return result;
  // Products and prices show on both: a new product on the Prices list, a new price on its page.
  revalidatePath("/catalog", "layout");
  revalidatePath("/prices", "layout");
  return { ok: true, data: { importId: result.data.importId, rows: result.data.rows } };
}
