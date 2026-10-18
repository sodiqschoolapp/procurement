import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { issueStock } from "@/features/warehouse/actions/issue";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { runOrdersAction } from "@/server/order-action";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch, setManagerRight } from "../../../../../../../tests/helpers/branches";
import {
  insertProduct,
  insertSubtypes,
  insertUnit,
} from "../../../../../../../tests/helpers/catalog";
import { setClock } from "../../../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../../../tests/helpers/files";
import {
  insertDepartment,
  insertItem,
  insertOrder,
} from "../../../../../../../tests/helpers/orders";
import { pdfPages } from "../../../../../../../tests/helpers/pdf-text";
import { insertUser, signInAs } from "../../../../../../../tests/helpers/users";
import { GET } from "./route";

// The issue note through its route (build plan 5.4, Done when: "A test reads the number and both
// names from the file and finds no signature line"). 09-warehouse.md, Issue to a department 2 ("a
// PDF issue note naming who gave the items and who received them, as typed. There are no
// signature lines", owner's decision of 15 October 2026); 05-order-request-form.md, Download 2
// and 3 (who downloaded it and when on every page; the downloader's language); 03 rule 1 and the
// matrix row "Export to Excel, download PDF, print"; plan of 5.4, decided items 4 and 8 and the
// review's correction 3 (a note with no receiver).

const AT = "2031-05-03T06:00:00Z";
const GIVER = "Sinov Beruvchi";
const RECEIVER = "Sinov Qabulqiluvchi";
const CYRILLIC_PRODUCT = "Тетрадь Синов";
let made = 0;

function download(id: string, cookie?: { name: string; value: string }) {
  return GET(downloadRequest(`/warehouse/documents/${id}/note`, cookie), {
    params: Promise.resolve({ id }),
  });
}

async function scene(locale: "uz" | "ru" | "en" = "en") {
  setClock(AT);
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", {
    branches: [branch.id],
    fullName: GIVER,
    locale,
  });
  const department = await insertDepartment(branch.id, {
    name: "Sinov bo'limi",
    responsibleName: "Sinov Mas'ul",
  });
  made += 1;
  const product = await insertProduct({
    name: `${CYRILLIC_PRODUCT} ${made}`,
    unitId: (await insertUnit({ allowDecimal: true })).id,
  });
  const [blue] = await insertSubtypes(product.id, [{ name: "Ko'k" }]);
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId: branch.id,
      variantId: blue!,
      type: "RECEIPT",
      qtyDelta: "12.5",
      unitCost: 1000n,
      createdBy: manager.id,
    }),
  );
  const issued = await runAction(issueStock, manager.id, {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-02",
    departmentId: department.id,
    receivedByName: RECEIVER,
    comment: "Sinov izohi",
    lines: [{ variantId: blue!, qty: "2.5" }],
  });
  expect(issued.ok).toBe(true);
  const { documentId, number } = issued.ok ? issued.data : { documentId: "", number: "" };
  return { branch, manager, department, documentId, number };
}

describe("GET /warehouse/documents/[id]/note (09 Issue to a department 2)", () => {
  it("is a PDF naming the number, the date, the department, the items, who gave and who received, with no signature line", async () => {
    const s = await scene();
    const response = await download(s.documentId, await signInAs(s.manager));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="${s.number}.pdf"`,
    );
    const pages = await pdfPages(new Uint8Array(await response.arrayBuffer()));
    const all = pages.join(" ");
    expect(all).toContain(`Issue note ${s.number}`);
    expect(all).toContain("02.05.2031");
    expect(all).toContain("Sinov bo'limi");
    expect(all).toContain(CYRILLIC_PRODUCT);
    expect(all).toContain("Ko'k");
    expect(all).toContain("2.5");
    expect(all).toMatch(new RegExp(`Given by ${GIVER}`));
    expect(all).toMatch(new RegExp(`Received by ${RECEIVER}`));
    expect(all).toContain("Sinov izohi");
    for (const page of pages) expect(page).toContain(`Downloaded by ${GIVER}, 03.05.2031`);
    // No signature lines, in any language (owner's decision of 15 October 2026).
    expect(all).not.toMatch(/signature|подпись|imzo/i);
  });

  it("is in the downloader's language (05 Download 3)", async () => {
    const s = await scene("ru");
    const pages = await pdfPages(
      new Uint8Array(await (await download(s.documentId, await signInAs(s.manager))).arrayBuffer()),
    );
    const all = pages.join(" ");
    expect(all).toContain(`Накладная на выдачу ${s.number}`);
    expect(all).toMatch(new RegExp(`Выдал ${GIVER}`));
    expect(all).not.toMatch(/подпись/i);
  });

  it('prints a dash for an issue of "Give straight to requester" with nobody named (decided item 4)', async () => {
    setClock(AT);
    const branch = await insertBranch();
    const owner = await insertUser("MANAGER", {
      branches: [branch.id],
      fullName: GIVER,
      locale: "en",
    });
    const department = await insertDepartment(branch.id);
    const item = await insertItem();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: owner.id,
      status: "PURCHASING",
      variantId: item.variantId,
      departmentId: department.id,
      plannedQty: "3",
      plannedPrice: 1000n,
      approvedAt: new Date("2031-05-01T07:00:00Z"),
    });
    const bought = await runOrdersAction(recordPurchase, owner.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      purchasedOn: "2031-05-03",
      paymentType: "CASH",
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: order.id,
          variantId: order.variantId,
          qty: "3",
          unitPrice: "1000",
          extras: [],
          comment: null,
          giveToRequester: true,
        },
      ],
    });
    expect(bought.ok).toBe(true);
    const found = await db.execute<{ id: string }>(
      `select id from stock_documents where branch_id = '${branch.id}' and type = 'ISSUE'`,
    );
    const pages = await pdfPages(
      new Uint8Array(
        await (await download(found.rows[0]!.id, await signInAs(owner))).arrayBuffer(),
      ),
    );
    expect(pages.join(" ")).toMatch(/Received by —/);
  });

  it("gives a Principal of the branch the note; 401 signed out; 404 for another branch and an unknown id (03 rule 1)", async () => {
    const s = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [s.branch.id] });
    expect((await download(s.documentId, await signInAs(principal))).status).toBe(200);
    // Export needs no Manager right (03 matrix "Export to Excel, download PDF, print").
    const finance = await insertUser("FINANCE", { branches: [s.branch.id] });
    expect((await download(s.documentId, await signInAs(finance))).status).toBe(200);
    const switchedOff = await insertUser("MANAGER", { branches: [s.branch.id] });
    await setManagerRight(switchedOff.id, "ISSUE_STOCK", false);
    expect((await download(s.documentId, await signInAs(switchedOff))).status).toBe(200);

    expect((await download(s.documentId)).status).toBe(401);
    const elsewhere = await insertBranch();
    const stranger = await insertUser("MANAGER", { branches: [elsewhere.id] });
    expect((await download(s.documentId, await signInAs(stranger))).status).toBe(404);
    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      const outsider = await insertUser(role, { branches: [elsewhere.id] });
      expect((await download(s.documentId, await signInAs(outsider))).status).toBe(404);
    }
    expect((await download(randomUUID(), await signInAs(s.manager))).status).toBe(404);
    expect((await download("not-an-id", await signInAs(s.manager))).status).toBe(404);
  });
});
