import { describe, expect, it } from "vitest";

import { fileForDownload } from "@/features/files/queries/file-for-download";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../tests/helpers/branches";
import { insertFileRow } from "../../../tests/helpers/catalog";
import { insertMoneyAction, insertMoneyRow } from "../../../tests/helpers/money";
import { insertOrder } from "../../../tests/helpers/orders";
import { insertUser } from "../../../tests/helpers/users";
import { MONEY_FILES, accessOf } from "./owners";

// MONEY_FILES, the owner of money_actions.file_id (plan of 4.3, decided item 6, Look first;
// progress 4.1, "For 4.3": its target covers the branches of the action's rows; permission review
// of 4.3, Should fix 1). Written straight into the tables, so the two-branch case no writer allows
// reaches the owner with nothing in front of it (D39).

async function scene() {
  const branch = await insertBranch();
  const second = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id, second.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, second, manager, finance, head };
}

describe("MONEY_FILES (08 Money ledger: an optional file)", () => {
  it("an action of one branch: data.view on that branch", async () => {
    const { branch, manager, finance } = await scene();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    const file = await insertFileRow(finance.id, "application/pdf");
    const action = (
      await insertMoneyAction({ managerId: manager.id, createdBy: finance.id, fileId: file.id })
    ).rows[0]!.id;
    await insertMoneyRow({ moneyActionId: action, orderId: order.id });
    expect(await MONEY_FILES.find(db, file.id)).toEqual({
      permission: "data.view",
      target: { branchId: branch.id },
    });
  });

  it("an action whose rows span two branches keeps the file held, for the Head only; Finance of one branch is refused", async () => {
    const { branch, second, manager, finance, head } = await scene();
    const one = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    const two = await insertOrder({
      branchId: second.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    const file = await insertFileRow(finance.id, "application/pdf");
    const action = (
      await insertMoneyAction({ managerId: manager.id, createdBy: finance.id, fileId: file.id })
    ).rows[0]!.id;
    await insertMoneyRow({ moneyActionId: action, orderId: one.id });
    await insertMoneyRow({ moneyActionId: action, orderId: two.id });
    // Held: never free for another record to take (the file contract of owners.ts).
    expect(await accessOf(db, file.id)).toEqual({ permission: "catalog.manage" });
    // The uploader too is refused: the file is held, so the uploader's own path does not apply.
    await expect(fileForDownload(finance.id, file.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(fileForDownload(head.id, file.id)).resolves.toBeDefined();
  });
});
