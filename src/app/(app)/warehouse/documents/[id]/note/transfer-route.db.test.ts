import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { receiveTransfer } from "@/features/warehouse/actions/receive-transfer";
import { sendTransfer } from "@/features/warehouse/actions/transfer";
import { sql } from "drizzle-orm";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../../../../tests/helpers/branches";
import { setClock } from "../../../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../../../tests/helpers/files";
import { insertItem } from "../../../../../../../tests/helpers/orders";
import { pdfPages } from "../../../../../../../tests/helpers/pdf-text";
import { insertUser, signInAs } from "../../../../../../../tests/helpers/users";
import { GET } from "./route";

const AT = "2031-05-03T06:00:00Z";
const SENDER = "Sinov Yuboruvchi";
const RECEIVER = "Sinov Qabulqiluvchi";

function download(id: string, cookie?: { name: string; value: string }) {
  return GET(downloadRequest(`/warehouse/documents/${id}/note`, cookie), {
    params: Promise.resolve({ id }),
  });
}

// The transfer note through the same route (plan of 7.1, decided item 12; 09 Other documents,
// Transfer: "a PDF transfer note naming who sent the items and who received them, as typed, with
// no signature lines"; plan of 7.2, decided items 3 and 12: of the sending and the receiving
// branch, with what arrived once received).
describe("GET /warehouse/documents/[id]/note for a transfer (09 Other documents, Transfer)", () => {
  async function sent(locale: "uz" | "ru" | "en", receivedByName: string | null) {
    setClock(AT);
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", {
      branches: [branch.id],
      fullName: SENDER,
      locale,
    });
    const s = { branch, manager };
    const receiving = await insertBranch();
    const item = await insertItem();
    await db.transaction((tx) =>
      postMovement(tx, {
        branchId: s.branch.id,
        variantId: item.variantId,
        type: "RECEIPT",
        qtyDelta: "6",
        unitCost: 1000n,
        createdBy: s.manager.id,
      }),
    );
    const made = await runAction(sendTransfer, s.manager.id, {
      clientKey: randomUUID(),
      branchId: s.branch.id,
      toBranchId: receiving.id,
      docDate: "2031-05-02",
      receivedByName,
      comment: null,
      lines: [{ variantId: item.variantId, qty: "4" }],
    });
    expect(made.ok).toBe(true);
    const { documentId, number } = made.ok ? made.data : { documentId: "", number: "" };
    return { ...s, receiving, documentId, number };
  }

  it("is a PDF naming the number, both branches, who sent and who receives as typed, with no signature line", async () => {
    const t = await sent("en", RECEIVER);
    const response = await download(t.documentId, await signInAs(t.manager));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="${t.number}.pdf"`,
    );
    const pages = await pdfPages(new Uint8Array(await response.arrayBuffer()));
    const all = pages.join(" ");
    expect(all).toContain(`Transfer note ${t.number}`);
    expect(all).toContain("02.05.2031");
    expect(all).toContain(`From branch ${t.branch.code}`);
    expect(all).toContain(`To branch ${t.receiving.code}`);
    expect(all).toMatch(new RegExp(`Sent by ${SENDER}`));
    expect(all).toMatch(new RegExp(`Received by ${RECEIVER}`));
    expect(all).not.toContain("Given by");
    for (const page of pages) expect(page).toContain(`Downloaded by ${SENDER}, 03.05.2031`);
    expect(all).not.toMatch(/signature|подпись|imzo/i);
  });

  it("prints a dash when the sender named nobody, in the downloader's language (decided item 6; 05 Download 3)", async () => {
    const t = await sent("ru", null);
    const pages = await pdfPages(
      new Uint8Array(await (await download(t.documentId, await signInAs(t.manager))).arrayBuffer()),
    );
    const all = pages.join(" ");
    expect(all).toContain(`Накладная на перемещение ${t.number}`);
    expect(all).toMatch(/Получил —/);
    expect(all).not.toMatch(/подпись/i);
  });

  // 7.1 kept the note from the receiving branch until 7.2 (its decided item 5); 7.2 opens it
  // (decided item 3, Look first), so this test changed with the requirement.
  it("is downloaded by the receiving branch's Manager and Finance, and is 404 for a third branch's (03 rule 1; 7.2 decided item 3)", async () => {
    const t = await sent("en", null);
    const there = await insertUser("MANAGER", { branches: [t.receiving.id] });
    expect((await download(t.documentId, await signInAs(there))).status).toBe(200);
    const finance = await insertUser("FINANCE", { branches: [t.receiving.id] });
    expect((await download(t.documentId, await signInAs(finance))).status).toBe(200);
    const elsewhere = await insertBranch();
    const stranger = await insertUser("MANAGER", { branches: [elsewhere.id] });
    expect((await download(t.documentId, await signInAs(stranger))).status).toBe(404);
    const principal = await insertUser("PRINCIPAL", { branches: [t.branch.id] });
    expect((await download(t.documentId, await signInAs(principal))).status).toBe(200);
  });

  it("once received, shows what arrived and who received it as typed (7.2 decided items 8 and 12)", async () => {
    const t = await sent("en", null);
    const there = await insertUser("MANAGER", { branches: [t.receiving.id], locale: "en" });
    const [line] = (
      await db.execute<{ id: string }>(
        sql`select id from stock_document_lines where document_id = ${t.documentId}`,
      )
    ).rows;
    const received = await runAction(receiveTransfer, there.id, {
      documentId: t.documentId,
      receivedByName: RECEIVER,
      lines: [{ lineId: line!.id, receivedQty: "3" }],
    });
    expect(received.ok).toBe(true);
    const pages = await pdfPages(
      new Uint8Array(await (await download(t.documentId, await signInAs(there))).arrayBuffer()),
    );
    const all = pages.join(" ");
    expect(all).toMatch(new RegExp(`Received by ${RECEIVER}`));
    expect(all).toMatch(/Sent\s+Received/);
    expect(all).toMatch(/4 \S+\s+3 \S+/);
  });
});
