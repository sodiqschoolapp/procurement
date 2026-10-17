import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { recentPurchaseSince } from "@/domain/prices";
import { addPrice } from "@/features/catalog/actions/prices";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { auditLog, priceHistory, productVariants } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { getPricePrompts } from "./price-prompts";

// The price prompt, build plan 3.10 (Done when: a database test written from the answer to open
// question 8; the one-click update writes a price_history row with source HEAD). Open question 8,
// Decided ahead 2: "the last 3 purchase records of that subtype in that branch within the last 90
// days, at least 2 of them. Cancelled records do not count. Fewer than 2 such records: no prompt.
// The prompt comes when the average unit price of those records differs from the reference price
// by more than 20%"; 04-catalogs.md rule 4; plan of 3.10, decided items 4 to 7 and 12. Every case
// that prompts has the records the rule must leave out beside it (D40). The records are written
// straight into the tables, as the window needs trip dates no action allows today.

const TODAY = "2031-05-10";
const SINCE = recentPurchaseSince(TODAY); // 2031-02-10
const DAY_BEFORE = "2031-02-09";

async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const head = await insertUser("HEAD");
  const branch = await insertBranch();
  return { head, branch };
}

type Scene = Awaited<ReturnType<typeof scene>>;

/** One trip of one record of `variantId` in the branch, dated `on`; cancelled when asked. */
async function bought(
  s: Scene,
  variantId: string,
  on: string,
  unitPrice: string,
  options: { branchId?: string; cancelled?: boolean; orderVariantId?: string } = {},
) {
  const branchId = options.branchId ?? s.branch.id;
  const order = await insertOrder({
    branchId,
    ownerId: s.head.id,
    status: "PURCHASING",
    variantId: options.orderVariantId ?? variantId,
  });
  const tripId = (await insertTrip(branchId, s.head.id, randomUUID(), on)).rows[0]!.id;
  const record = await insertPurchaseRow({
    tripId,
    orderId: order.id,
    branchId,
    variantId,
    createdBy: s.head.id,
    unitPrice,
  });
  const id = record.rows[0]!.id;
  if (options.cancelled) {
    await db.execute(sql`
      update purchases set is_cancelled = true, cancel_reason = 'Typed the wrong price',
        cancelled_by = ${s.head.id}, cancelled_at = now()
      where id = ${id}`);
  }
  return id;
}

async function promptsOf(s: Scene, variantId: string) {
  return (await getPricePrompts(s.head.id)).filter((row) => row.variantId === variantId);
}

describe("getPricePrompts(): open question 8 as answered (Decided ahead 2)", () => {
  it("exactly 2 records past 20% prompt; a gift, a cancelled record and one from before the window do not count", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, item.variantId, "2031-05-01", "13000");
    await bought(s, item.variantId, "2031-05-03", "12000");
    await bought(s, item.variantId, "2031-05-09", "0"); // a gift (decided item 4)
    await bought(s, item.variantId, "2031-05-08", "1000", { cancelled: true });
    await bought(s, item.variantId, DAY_BEFORE, "1000");

    expect(await promptsOf(s, item.variantId)).toEqual([
      expect.objectContaining({
        branchId: s.branch.id,
        branchCode: s.branch.code,
        referencePrice: 10_000n,
        average: 12_500n,
        percent: 25n,
        count: 2,
      }),
    ]);
  });

  it("only 1 record left after the exclusions gives no prompt", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, item.variantId, "2031-05-01", "13000");
    await bought(s, item.variantId, "2031-05-02", "13000", { cancelled: true });
    await bought(s, item.variantId, "2031-05-03", "0");
    await bought(s, item.variantId, DAY_BEFORE, "13000");

    expect(await promptsOf(s, item.variantId)).toEqual([]);
  });

  it("only the last 3 count: a 4th, older record is left out", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    // With the 4th the mean would be 10 000: no prompt.
    await bought(s, item.variantId, "2031-03-01", "1000");
    await bought(s, item.variantId, "2031-04-01", "13000");
    await bought(s, item.variantId, "2031-04-02", "13000");
    await bought(s, item.variantId, "2031-04-03", "13000");

    expect(await promptsOf(s, item.variantId)).toEqual([
      expect.objectContaining({ average: 13_000n, percent: 30n, count: 3 }),
    ]);
  });

  it("the window: a trip dated its first day counts, the day before does not (decided item 6)", async () => {
    expect(SINCE).toBe("2031-02-10");
    const s = await scene();
    const inside = await insertItem({ referencePrice: 10_000n });
    await bought(s, inside.variantId, SINCE, "13000");
    await bought(s, inside.variantId, "2031-03-01", "13000");
    const outside = await insertItem({ referencePrice: 10_000n });
    await bought(s, outside.variantId, DAY_BEFORE, "13000");
    await bought(s, outside.variantId, "2031-03-01", "13000");

    expect(await promptsOf(s, inside.variantId)).toEqual([
      expect.objectContaining({ count: 2, average: 13_000n }),
    ]);
    expect(await promptsOf(s, outside.variantId)).toEqual([]);
  });

  it("per branch: another branch's records give their own prompt and never join this one's mean (decided item 5)", async () => {
    const s = await scene();
    const other = await insertBranch();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, item.variantId, "2031-05-01", "13000");
    await bought(s, item.variantId, "2031-05-02", "13000");
    await bought(s, item.variantId, "2031-05-03", "15000", { branchId: other.id });
    await bought(s, item.variantId, "2031-05-04", "15000", { branchId: other.id });
    // A third branch with one record: no prompt there, and its record joins no other branch.
    const third = await insertBranch();
    await bought(s, item.variantId, "2031-05-05", "40000", { branchId: third.id });

    const rows = await promptsOf(s, item.variantId);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.branchId === s.branch.id)).toMatchObject({
      average: 13_000n,
      count: 2,
    });
    expect(rows.find((row) => row.branchId === other.id)).toMatchObject({
      average: 15_000n,
      count: 2,
    });
  });

  it("per subtype: another subtype's records stay apart, and a substitution counts for the subtype bought (decided item 7)", async () => {
    const s = await scene();
    const product = await insertProduct();
    const [ordered, boughtInstead] = await insertSubtypes(product.id, [
      { referencePrice: 10_000n },
      { referencePrice: 10_000n },
    ]);
    // Ordered as the first subtype, bought as the second (07 Substitution).
    await bought(s, boughtInstead!, "2031-05-01", "13000", { orderVariantId: ordered! });
    await bought(s, boughtInstead!, "2031-05-02", "13000", { orderVariantId: ordered! });
    await bought(s, ordered!, "2031-05-03", "13000");

    expect(await promptsOf(s, boughtInstead!)).toEqual([
      expect.objectContaining({ count: 2, average: 13_000n }),
    ]);
    expect(await promptsOf(s, ordered!)).toEqual([]);
  });

  it("no reference price, or an inactive subtype, gives no prompt (decided item 12)", async () => {
    const s = await scene();
    const unpriced = await insertItem();
    const inactive = await insertItem({ referencePrice: 10_000n, isActive: false });
    for (const variantId of [unpriced.variantId, inactive.variantId]) {
      await bought(s, variantId, "2031-05-01", "13000");
      await bought(s, variantId, "2031-05-02", "13000");
    }

    expect(await promptsOf(s, unpriced.variantId)).toEqual([]);
    expect(await promptsOf(s, inactive.variantId)).toEqual([]);
  });
});

describe("the one click: addPrice with the prompt's average (Done when; decided item 11)", () => {
  it("writes a HEAD row of price_history, the reference price and the audit row; the prompt is gone", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, item.variantId, "2031-05-01", "13000");
    await bought(s, item.variantId, "2031-05-02", "12000");
    const [prompt] = await promptsOf(s, item.variantId);
    expect(prompt).toMatchObject({ average: 12_500n });

    const result = await runAction(addPrice, s.head.id, {
      clientKey: randomUUID(),
      variantId: item.variantId,
      price: prompt!.average.toString(),
      note: `Average of 2 recent purchases in ${s.branch.code}`,
    });
    expect(result.ok).toBe(true);

    const [newest] = await db
      .select({ price: priceHistory.price, source: priceHistory.source, setBy: priceHistory.setBy })
      .from(priceHistory)
      .where(eq(priceHistory.variantId, item.variantId))
      .orderBy(desc(priceHistory.seq))
      .limit(1);
    expect(newest).toEqual({ price: 12_500n, source: "HEAD", setBy: s.head.id });
    const [variant] = await db
      .select({ referencePrice: productVariants.referencePrice })
      .from(productVariants)
      .where(eq(productVariants.id, item.variantId));
    expect(variant!.referencePrice).toBe(12_500n);
    expect(
      await db.$count(
        auditLog,
        and(eq(auditLog.action, "price.add"), eq(auditLog.actorId, s.head.id)),
      ),
    ).toBeGreaterThan(0);
    expect(await promptsOf(s, item.variantId)).toEqual([]);
  });
});

describePermissionMatrix("getPricePrompts", {
  permission: "catalog.manage",
  run: ({ user }) => getPricePrompts(user.id),
});
