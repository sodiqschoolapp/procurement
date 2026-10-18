import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { searchDirectEntryItems } from "./direct-entry-form";

// The search of the direct-entry form (09-warehouse.md, Direct entry by the Head, Lines: "Cost is
// prefilled with the reference price"; plan of 5.8, decided items 1 and 10). Every active goods
// subtype is listed, in stock or not, with the stock of the chosen branch only and the subtype's
// own reference price (none when it has none).

let branch: { id: string };
let other: { id: string };
let head: string;

beforeEach(async () => {
  setClock("2031-05-03T06:00:00Z");
  branch = await insertBranch();
  other = await insertBranch();
  head = (await insertUser("HEAD")).id;
});

describe("searchDirectEntryItems (09 Direct entry, Lines; plan of 5.8)", () => {
  it("lists subtypes with and without stock, the branch's stock and each one's reference price", async () => {
    const tag = randomUUID().slice(0, 8);
    const product = await insertProduct({ name: `Stul ${tag}` });
    const [priced, bare] = await insertSubtypes(product.id, [
      { name: "Katta", referencePrice: 150000n },
      { name: "Kichik" },
    ]);
    await receive(branch.id, priced!, "4", 150000n, head);
    // Another branch's stock is not this branch's.
    await receive(other.id, bare!, "9", 1000n, head);

    const items = await searchDirectEntryItems(head, { branchId: branch.id, q: `Stul ${tag}` });
    expect(items).toEqual([
      expect.objectContaining({
        id: product.id,
        subtypes: [
          { id: priced!, name: "Katta", inStock: "4.000", referencePrice: "150000" },
          { id: bare!, name: "Kichik", inStock: "0", referencePrice: null },
        ],
      }),
    ]);
  });

  it("leaves out services, inactive products and inactive subtypes (A7; 04 rule 2)", async () => {
    const tag = randomUUID().slice(0, 8);
    await insertProduct({ name: `Kirit ${tag} xizmat`, type: "SERVICE" });
    await insertProduct({ name: `Kirit ${tag} eski`, isActive: false });
    const kept = await insertProduct({ name: `Kirit ${tag} bor` });
    const [, dropped] = await insertSubtypes(kept.id, [
      { name: "Bor" },
      { name: "Yo'q", isActive: false },
    ]);
    const items = await searchDirectEntryItems(head, { branchId: branch.id, q: `Kirit ${tag}` });
    expect(items.map((item) => item.id)).toEqual([kept.id]);
    expect(items[0]!.subtypes.map((subtype) => subtype.id)).not.toContain(dropped);
  });
});
