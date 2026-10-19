import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../../tests/helpers/branches";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { enterStockDirectly } from "../actions/direct-entry";
import { issueStock } from "../actions/issue";
import { sendTransfer } from "../actions/transfer";
import { documentDepartmentChoices, listStockDocuments } from "./documents";

// The documents list (build-plan 5.12, Done when: "A database test for the branch wall"; by hand
// "filter to the issues of one department"). 09-warehouse.md, Stock screens: Documents ("All
// issues, returns, transfers, write-offs and counts, with filters by type, date and department");
// 11-screens-and-ux.md, Screens: "Warehouse documents | All", rule 8; 03-roles-and-permissions.md,
// Permission matrix "See orders, stock and reports" and rule 1; plan of 5.12, decided items 5 and
// 6. Every fixture is asserted (D38); each filter's test keeps a row beside that only it leaves
// out (.claude/rules/tests.md).

/** A branch with stock of one item, a Manager, and two departments. */
async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const item = await insertItem();
  await receive(branch.id, item.variantId, "50", 1000n, manager.id);
  const science = await insertDepartment(branch.id, { name: `Fizika ${randomUUID().slice(0, 6)}` });
  const sport = await insertDepartment(branch.id, { name: `Sport ${randomUUID().slice(0, 6)}` });
  return { branch, manager, item, science, sport };
}

type Scene = Awaited<ReturnType<typeof scene>>;

/** An issue on a business date through the action; asserted. */
async function issueOn(s: Scene, day: string, departmentId: string) {
  setClock(`${day}T07:00:00Z`);
  const made = await runAction(issueStock, s.manager.id, {
    clientKey: randomUUID(),
    branchId: s.branch.id,
    docDate: day,
    departmentId,
    receivedByName: "Sinov Qabulqiluvchi",
    comment: null,
    lines: [{ variantId: s.item.variantId, qty: "1" }],
  });
  if (!made.ok) throw new Error(`fixture: ${made.error.code}`);
  return made.data;
}

const numbers = (page: { rows: { number: string }[] }) => page.rows.map((row) => row.number);

describe("listStockDocuments: the branch wall (03 rule 1; Done when)", () => {
  it("a Manager sees their branch's documents and not another branch's; asking for the other branch is Not found", async () => {
    const s = await scene();
    const mine = await issueOn(s, "2031-05-10", s.science.id);
    const other = await insertBranch();
    const otherMaker = await insertUser("MANAGER", { branches: [other.id] });
    const otherItem = await insertItem();
    await receive(other.id, otherItem.variantId, "5", 1000n, otherMaker.id);
    const theirs = await postDocument({
      type: "ISSUE",
      branchId: other.id,
      departmentId: (await insertDepartment(other.id)).id,
      createdBy: otherMaker.id,
      lines: [{ variantId: otherItem.variantId, qty: "1" }],
    });

    expect(numbers(await listStockDocuments(s.manager.id))).toEqual([mine.number]);
    await expect(listStockDocuments(s.manager.id, { branch: other.id })).rejects.toEqual(
      new AuthorizationError("not_found"),
    );
    // The Principal of the branch sees its documents only; the Head sees both.
    const principal = await insertUser("PRINCIPAL", { branches: [s.branch.id] });
    expect(numbers(await listStockDocuments(principal.id))).toEqual([mine.number]);
    const head = await insertUser("HEAD");
    const all = numbers(await listStockDocuments(head.id));
    expect(all).toEqual(expect.arrayContaining([mine.number, theirs.number]));
  });

  it("the department choices are of the user's branches only, inactive ones too (04 rule 2; decided item 6)", async () => {
    const s = await scene();
    const closed = await insertDepartment(s.branch.id, { isActive: false });
    const other = await insertBranch();
    const elsewhere = await insertDepartment(other.id);
    const ids = (await documentDepartmentChoices(s.manager.id)).map((choice) => choice.id);
    expect(ids).toEqual(expect.arrayContaining([s.science.id, s.sport.id, closed.id]));
    expect(ids).not.toContain(elsewhere.id);
    await expect(documentDepartmentChoices(s.manager.id, other.id)).rejects.toEqual(
      new AuthorizationError("not_found"),
    );
  });
});

describe("listStockDocuments: the filters (09 Stock screens: Documents)", () => {
  it("by department: the issues of one department, not another's of the same branch, same type and date", async () => {
    const s = await scene();
    const science = await issueOn(s, "2031-05-10", s.science.id);
    await issueOn(s, "2031-05-10", s.sport.id);
    const page = await listStockDocuments(s.manager.id, {
      type: "ISSUE",
      department: s.science.id,
    });
    expect(numbers(page)).toEqual([science.number]);
  });

  it("by type: a direct entry of the same branch and date is left out of the issues, and found as a direct entry (decided item 5)", async () => {
    const s = await scene();
    const issue = await issueOn(s, "2031-05-10", s.science.id);
    const head = await insertUser("HEAD");
    // The clock is frozen by issueOn(): the entry is made a minute later, so "the later made
    // first" is decided by created_at, not by the random ids of a tie.
    advanceClock({ minutes: 1 });
    const entry = await runAction(enterStockDirectly, head.id, {
      clientKey: randomUUID(),
      branchId: s.branch.id,
      docDate: "2031-05-10",
      reason: "EXISTING_STOCK",
      comment: null,
      lines: [{ variantId: s.item.variantId, qty: "2", unitCost: "1000" }],
    });
    if (!entry.ok) throw new Error(`fixture: ${entry.error.code}`);
    expect(numbers(await listStockDocuments(s.manager.id, { type: "ISSUE" }))).toEqual([
      issue.number,
    ]);
    expect(numbers(await listStockDocuments(s.manager.id, { type: "DIRECT_ENTRY" }))).toEqual([
      entry.data.number,
    ]);
    // Newest first: same date, the later made first.
    expect(numbers(await listStockDocuments(s.manager.id))).toEqual([
      entry.data.number,
      issue.number,
    ]);
  });

  it("by date: from and to are both inside; a day before and a day after are out (decided item 6)", async () => {
    const s = await scene();
    const before = await issueOn(s, "2031-05-09", s.science.id);
    const first = await issueOn(s, "2031-05-10", s.science.id);
    const last = await issueOn(s, "2031-05-12", s.science.id);
    const after = await issueOn(s, "2031-05-13", s.science.id);
    const page = await listStockDocuments(s.manager.id, { from: "2031-05-10", to: "2031-05-12" });
    expect(numbers(page)).toEqual([last.number, first.number]);
    expect(numbers(await listStockDocuments(s.manager.id))).toEqual([
      after.number,
      last.number,
      first.number,
      before.number,
    ]);
  });

  it("a filter that is not a type, a date or an id is ignored", async () => {
    const s = await scene();
    const issue = await issueOn(s, "2031-05-10", s.science.id);
    const page = await listStockDocuments(s.manager.id, {
      type: "NOT_A_TYPE",
      from: "10.05.2031",
      department: "not-an-id",
    });
    expect(numbers(page)).toEqual([issue.number]);
  });
});

describe("listStockDocuments: a transfer (build plan 7.1, from 5.12; decided item 5)", () => {
  it("is listed in the sending branch and found by the type Transfer, not among the issues; a Manager of only the receiving branch does not see it until 7.2", async () => {
    const s = await scene();
    const receiving = await insertBranch();
    const issue = await issueOn(s, "2031-05-10", s.science.id);
    const sent = await runAction(sendTransfer, s.manager.id, {
      clientKey: randomUUID(),
      branchId: s.branch.id,
      toBranchId: receiving.id,
      docDate: "2031-05-10",
      receivedByName: null,
      comment: null,
      lines: [{ variantId: s.item.variantId, qty: "3" }],
    });
    if (!sent.ok) throw new Error(`fixture: ${sent.error.code}`);

    const all = await listStockDocuments(s.manager.id, { branch: s.branch.id });
    expect(all.rows.find((row) => row.number === sent.data.number)).toMatchObject({
      type: "TRANSFER",
      status: "IN_TRANSIT",
      branchCode: s.branch.code,
      departmentName: null,
    });
    expect(numbers(await listStockDocuments(s.manager.id, { type: "TRANSFER" }))).toEqual([
      sent.data.number,
    ]);
    expect(numbers(await listStockDocuments(s.manager.id, { type: "ISSUE" }))).toEqual([
      issue.number,
    ]);

    const there = await insertUser("MANAGER", { branches: [receiving.id] });
    expect(numbers(await listStockDocuments(there.id))).not.toContain(sent.data.number);
  });
});
