import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import { previewImport } from "@/features/catalog/queries/imports";
import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../tests/helpers/files";
import { importSheet } from "../../../../tests/helpers/imports";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser, signInAs } from "../../../../tests/helpers/users";
import { importStock } from "./import-stock";

// The stock import in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix
// "Enter stock directly, without an order": the Head only, any branch; rule 1; plan of 5.9). The
// action and the preview query are called directly; the page's two exports through themselves with
// the session mock, and the template route for every role (.claude/rules/server-actions.md; review
// of the plan, should fix 5). The expected answers come from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => store.user,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { previewImportAction, saveImportAction } =
  await import("@/app/(app)/catalog/import/actions");
const { GET } = await import("@/app/(app)/catalog/import/[kind]/template/route");

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
  setClock("2031-05-03T06:00:00Z");
  store.user = null;
});

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

async function stockSheet() {
  const { name } = await insertItem();
  return importSheet("stock", [[name, "", 3, 1000]], "uz");
}

/** The .xlsx bytes of a stock sheet, as a Head fills the template. */
async function stockFile(): Promise<File> {
  const sheet = await stockSheet();
  const book = new ExcelJS.Workbook();
  const page = book.addWorksheet("Qoldiq");
  page.addRow(sheet.header.map((cell) => (cell.kind === "text" ? cell.text : null)));
  for (const row of sheet.rows) {
    page.addRow(
      row.cells.map((cell) =>
        cell.kind === "text" ? cell.text : cell.kind === "number" ? cell.value : null,
      ),
    );
  }
  return new File([new Uint8Array(await book.xlsx.writeBuffer())], "qoldiq.xlsx");
}

function formOf(file: File, branchId: string): FormData {
  const form = new FormData();
  form.set("kind", "stock");
  form.set("file", file);
  form.set("clientKey", newClientKey());
  form.set("branchId", branchId);
  return form;
}

describePermissionMatrix("importStock", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    const sheet = await stockSheet();
    asMatrixAnswer(
      await runAction(importStock, user.id, {
        clientKey: randomUUID(),
        fileName: "qoldiq.xlsx",
        branchId,
        sheet,
      }),
    );
  },
});

describePermissionMatrix("previewImport, stock", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    const preview = await previewImport(user.id, "stock", await stockSheet(), branchId);
    expect(preview.errors).toEqual([]);
  },
});

describePermissionMatrix("previewImportAction, stock", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    const file = await stockFile();
    signedIn(user);
    asMatrixAnswer(await previewImportAction(formOf(file, branchId)));
  },
});

describePermissionMatrix("saveImportAction, stock", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    const file = await stockFile();
    signedIn(user);
    asMatrixAnswer(await saveImportAction(formOf(file, branchId)));
  },
});

async function template(cookie?: Awaited<ReturnType<typeof signInAs>>) {
  return GET(downloadRequest("/catalog/import/stock/template", cookie), {
    params: Promise.resolve({ kind: "stock" }),
  });
}

// The page and its template name no branch yet: a list of a branch permission (authorizeList()),
// so their cases are written by hand, as for directEntryBranchChoices.
describe('the stock template, GET /catalog/import/stock/template (03 matrix "Enter stock directly"; plan of 5.9)', () => {
  it("the Head gets the four titles; a Manager with every right, a Principal and Finance 404; signed out 401", async () => {
    const own = await insertBranch();
    const head = await insertUser("HEAD");
    const response = await template(await signInAs(head));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("stock-template.xlsx");
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      const user = await insertUser(role, { branches: [own.id] });
      expect((await template(await signInAs(user))).status).toBe(404);
    }
    expect((await template()).status).toBe(401);
  });
});

describe("the page actions ask the branch before the file (plan of 5.9; plan review of 1.10, correction 1)", () => {
  it("a stock form without a branch is refused; another role's file is never saved", async () => {
    const own = await insertBranch();
    const file = await stockFile();
    signedIn(await insertUser("HEAD"));
    const form = formOf(file, own.id);
    form.delete("branchId");
    expect(await previewImportAction(form)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.required" } },
    });
    form.set("branchId", "not-a-uuid");
    expect(await saveImportAction(form)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.required" } },
    });
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    signedIn(manager);
    expect(await saveImportAction(formOf(file, own.id))).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    const documents = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from stock_documents where branch_id = ${own.id}`,
    );
    expect(documents.rows[0]!.count).toBe(0);
  });

  it("the Head's save answers with the numbers of the direct entries", async () => {
    const own = await insertBranch();
    signedIn(await insertUser("HEAD"));
    expect(await saveImportAction(formOf(await stockFile(), own.id))).toMatchObject({
      ok: true,
      data: { rows: 1, numbers: [`ENT-${own.code}-31-0001`] },
    });
  });
});
