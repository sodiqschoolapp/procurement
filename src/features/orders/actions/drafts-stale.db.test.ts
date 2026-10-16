import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { addDraft, insertDepartment, insertItem, orderRow } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { addPrice } from "../../catalog/actions/prices";
import { getPriceHistory } from "../../catalog/queries/prices";
import { listDrafts } from "../queries/drafts";

// A draft and a new catalog price, build plan 2.13: 15-quality-and-acceptance.md S18 ("The Head
// changes the notebook price from 5 000 to 6 500. A new draft suggests 6 500. An older draft keeps
// 5 000 and shows -23% vs catalog price. The price history lists both"); edge-cases/requests-
// and-approval.md ("The catalog price changes after the draft was written": "The draft keeps the
// typed price; a hint shows the new suggestion"); 05 field 11 and Ticking and filters (Price
// hint); plan of 2.13, decided item 9.

describe("S18: a new catalog price and the drafts (15 S18)", () => {
  it("a new draft suggests 6 500; the older draft keeps 5 000 with -23% vs catalog price; the history lists both", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const notebook = await insertItem({ referencePrice: 5_000n });
    const department = await insertDepartment(branch.id);
    const other = await insertDepartment(branch.id);

    const older = await addDraft(manager.id, {
      branchId: branch.id,
      variantId: notebook.variantId,
      departmentId: department.id,
    });
    expect(older).toMatchObject({ ok: true, data: { merged: false } });
    const olderId = (older as { ok: true; data: { id: string } }).data.id;
    expect(await orderRow(olderId)).toMatchObject({ plannedPrice: 5_000n });

    const priced = await runAction(addPrice, head.id, {
      clientKey: randomUUID(),
      variantId: notebook.variantId,
      price: "6 500",
      note: "Invented supplier note",
    });
    expect(priced).toMatchObject({ ok: true });

    // Another department, so the new add makes its own draft (05 Drafts 2).
    const newer = await addDraft(manager.id, {
      branchId: branch.id,
      variantId: notebook.variantId,
      departmentId: other.id,
    });
    expect(newer).toMatchObject({ ok: true, data: { merged: false } });
    const newerId = (newer as { ok: true; data: { id: string } }).data.id;
    expect(await orderRow(newerId)).toMatchObject({ plannedPrice: 6_500n });
    expect(await orderRow(olderId)).toMatchObject({ plannedPrice: 5_000n });

    const rows = new Map((await listDrafts(manager.id)).rows.map((row) => [row.id, row]));
    // (5 000 − 6 500) / 6 500 = −23.08%, past the 20% setting: "-23% vs catalog price".
    expect(rows.get(olderId)).toMatchObject({ price: 5_000n, priceHint: -23n });
    expect(rows.get(newerId)).toMatchObject({ price: 6_500n, priceHint: null });

    const history = await getPriceHistory(head.id, notebook.variantId);
    expect(history?.referencePrice).toBe(6_500n);
    expect(history?.rows.map((row) => row.price)).toEqual([6_500n, 5_000n]);
  });
});
