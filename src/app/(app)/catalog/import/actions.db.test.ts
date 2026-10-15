import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { branches, productVariants, products } from "@/server/db/schema";

import { insertCategory, insertProduct, insertUnit } from "../../../../../tests/helpers/catalog";
import { type Value, importSheet, productRow } from "../../../../../tests/helpers/imports";
import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../../tests/helpers/users";

// The page actions of /catalog/import/<kind> (plan of 1.10, "Server actions and queries"): under
// catalog.manage (03, "Manage catalogs, users, branches, settings": Head only), checked before the
// file is read (plan review of 1.10, correction 1; developer-rules.md rules 4 and 13). The reader
// is wrapped in a spy so a test can see it was never reached.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const reader = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/server/excel", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/excel")>();
  return {
    ...original,
    async readSheet(...args: Parameters<typeof original.readSheet>) {
      reader.calls += 1;
      return original.readSheet(...args);
    },
  };
});

const { previewImportAction, saveImportAction } = await import("./actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
    sessionToken: "invented-token",
  };
}

beforeEach(() => {
  store.user = null;
  reader.calls = 0;
});

/** The .xlsx bytes of a sheet: its header and rows, as a Head fills the template. */
async function workbook(rows: Value[][]): Promise<File> {
  const sheet = importSheet("products", rows, "uz");
  const book = new ExcelJS.Workbook();
  const page = book.addWorksheet("Mahsulotlar");
  page.addRow(sheet.header.map((cell) => (cell.kind === "text" ? cell.text : null)));
  for (const row of rows)
    page.addRow(row.map((value) => (typeof value === "object" ? null : value)));
  return new File([new Uint8Array(await book.xlsx.writeBuffer())], "mahsulotlar.xlsx");
}

async function validFile(): Promise<{ file: File; name: string }> {
  const name = `Mahsulot ${randomUUID().slice(0, 8)}`;
  const refs = { category: (await insertCategory()).name, measure: (await insertUnit()).name };
  return { file: await workbook([productRow(name, refs, { price: 12000 })]), name };
}

function formOf(file: File, kind = "products"): FormData {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  form.set("clientKey", newClientKey());
  return form;
}

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("previewImportAction", {
  permission: "catalog.manage",
  async run({ user }) {
    const { file } = await validFile();
    signedIn(user);
    asMatrixAnswer(await previewImportAction(formOf(file)));
  },
});

describePermissionMatrix("saveImportAction", {
  permission: "catalog.manage",
  async run({ user }) {
    const { file } = await validFile();
    signedIn(user);
    asMatrixAnswer(await saveImportAction(formOf(file)));
  },
});

describePermissionMatrix("saveImportAction, departments", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const [branch] = await db
      .select({ code: branches.code })
      .from(branches)
      .where(eq(branches.id, branchId));
    const book = new ExcelJS.Workbook();
    const page = book.addWorksheet("Boʻlimlar");
    page.addRow(
      importSheet("departments", [], "uz").header.map((cell) =>
        cell.kind === "text" ? cell.text : null,
      ),
    );
    page.addRow([branch!.code, `Matritsa ${randomUUID().slice(0, 8)}`]);
    const file = new File([new Uint8Array(await book.xlsx.writeBuffer())], "bolimlar.xlsx");
    signedIn(user);
    asMatrixAnswer(await saveImportAction(formOf(file, "departments")));
  },
});

/** A prices file of one product without subtypes, as a Head fills the template (plan of 1.11). */
async function pricesFile(): Promise<{ file: File; variantId: string }> {
  const product = await insertProduct({ name: `Narx ${randomUUID().slice(0, 8)}` });
  const book = new ExcelJS.Workbook();
  const page = book.addWorksheet("Narxlar");
  page.addRow(
    importSheet("prices", [], "uz").header.map((cell) => (cell.kind === "text" ? cell.text : null)),
  );
  page.addRow([product.name, null, 15000, "Yangi narx"]);
  const file = new File([new Uint8Array(await book.xlsx.writeBuffer())], "narxlar.xlsx");
  return { file, variantId: product.defaultVariantId };
}

// The prices import under price.add (03 Permission matrix, "Add a new price for a product"; plan
// of 1.11, decision 4, Look first).
describePermissionMatrix("saveImportAction, prices", {
  permission: "price.add",
  async run({ user }) {
    const { file } = await pricesFile();
    signedIn(user);
    asMatrixAnswer(await saveImportAction(formOf(file, "prices")));
  },
});

describePermissionMatrix("previewImportAction, prices", {
  permission: "price.add",
  async run({ user }) {
    const { file } = await pricesFile();
    signedIn(user);
    asMatrixAnswer(await previewImportAction(formOf(file, "prices")));
  },
});

describe("the import page actions (plan of 1.10; plan review, correction 1)", () => {
  it("a Manager's, Principal's or Finance user's upload is refused before the file is read", async () => {
    const { file, name } = await validFile();
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      signedIn(await insertUser(role));
      expect((await previewImportAction(formOf(file))).ok).toBe(false);
      expect((await saveImportAction(formOf(file))).ok).toBe(false);
    }
    expect(reader.calls).toBe(0);
    expect(
      await db
        .select()
        .from(products)
        .where(inArray(products.name, [name])),
    ).toEqual([]);
    // The Head's same file is read (D40).
    signedIn(await insertUser("HEAD"));
    expect(await saveImportAction(formOf(file))).toMatchObject({ ok: true, data: { rows: 1 } });
    expect(reader.calls).toBe(1);
  });

  it("signed out is refused before the file is read", async () => {
    const { file } = await validFile();
    expect(await previewImportAction(formOf(file))).toMatchObject({
      ok: false,
      error: { code: "signed_out" },
    });
    expect(reader.calls).toBe(0);
  });

  it("the preview of the Head's file shows its rows; a file that is not a workbook is named", async () => {
    signedIn(await insertUser("HEAD"));
    const { file, name } = await validFile();
    const preview = await previewImportAction(formOf(file));
    expect(preview).toMatchObject({ ok: true, data: { kind: "products", errors: [] } });
    expect(
      (preview as { ok: true; data: { rows: { texts: string[] }[] } }).data.rows[0]!.texts[0],
    ).toBe(name);
    const text = new File(["Nomi;Narxi\n"], "mahsulotlar.xlsx");
    expect(await previewImportAction(formOf(text))).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { file: "errors.field.notTemplate" } },
    });
    // An unknown kind ("prices" was one until 1.11 made it a kind).
    expect(await previewImportAction(formOf(file, "stock"))).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { kind: "errors.field.notAllowed" } },
    });
  });
});

describe("the prices import page actions (plan of 1.11, decision 4)", () => {
  it("a Manager's prices file is refused before it is read; the Head's sets the price", async () => {
    const { file, variantId } = await pricesFile();
    signedIn(await insertUser("MANAGER"));
    expect((await saveImportAction(formOf(file, "prices"))).ok).toBe(false);
    expect(reader.calls).toBe(0);
    signedIn(await insertUser("HEAD"));
    expect(await saveImportAction(formOf(file, "prices"))).toMatchObject({
      ok: true,
      data: { rows: 1 },
    });
    const [row] = await db
      .select({ price: productVariants.referencePrice })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(row!.price).toBe(15000n);
  });
});
