import { type Page, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { ORDER_FIELDS_DEFAULT } from "../../src/domain/order-fields";
import {
  type Scene,
  as,
  expect,
  newProduct,
  newScene,
  numberOf,
  scrollsSideways,
  statusOf,
  submitInGrid,
  tag,
  withDatabase,
} from "./acceptance-fixtures";

// The fields the Head sets, clicked through at 375 px and 1440 px (build plan 2.5d, Done when;
// 05-order-request-form.md, Fields the Head sets 1 to 4; plan of 2.5d-a: every field but the
// price). The setting is the whole school's, and every other browser test's sheet reads it: this
// file is the project `order-fields`, the teardown of `finance-step`, so it runs after every other
// test of the run, its two widths one after the other, and leaves the defaults behind
// (playwright.config.ts).

const of = en.settings.orderFields;

test.describe.configure({ mode: "serial" });

async function writeFields(value: unknown): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `insert into settings (key, value, created_at) values ('order_fields', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(value)],
    );
  });
}

/** The Head sets three fields on /settings and saves; the page says so. */
async function headSetsFields(page: Page, scene: Scene): Promise<void> {
  await as(page, scene.head);
  await page.goto("/settings");
  const block = page.locator("[data-order-fields]");
  await block
    .getByRole("combobox", { name: of.askLabel.replace("{field}", of.field.neededBy) })
    .selectOption("hidden");
  await block
    .getByRole("combobox", { name: of.askLabel.replace("{field}", of.field.department) })
    .selectOption("optional");
  await block
    .getByRole("combobox", { name: of.placeLabel.replace("{field}", of.field.brand) })
    .selectOption("row");
  // The price offers Required only until task 2.5d-b (plan of 2.5d, decided item 1).
  await expect(
    block
      .getByRole("combobox", { name: of.askLabel.replace("{field}", of.field.price) })
      .locator("option"),
  ).toHaveCount(1);
  expect(await scrollsSideways(page)).toBe(false);
  await block.getByRole("button", { name: of.save }).click();
  await expect(page.getByText(of.saved).first()).toBeVisible();
}

/** A draft of the scene's Manager with neither a department nor a needed-by date. */
async function bareDraft(scene: Scene, product: string): Promise<{ id: string; product: string }> {
  const variantId = await newProduct(product, 4_500);
  const id = await withDatabase(async (client) => {
    const made = await client.query<{ id: string }>(
      `insert into orders (branch_id, owner_id, created_by, variant_id, planned_qty, planned_price,
                           payment_type, created_at, updated_at)
       values ($1, $2, $2, $3, 10, 4500, 'CASH', now(), now()) returning id`,
      [scene.branch.id, scene.manager.id, variantId],
    );
    return made.rows[0]!.id;
  });
  return { id, product };
}

const WIDTHS = [
  { name: "375 px", viewport: { width: 375, height: 812 } },
  { name: "1440 px", viewport: { width: 1440, height: 900 } },
] as const;

for (const width of WIDTHS) {
  test.describe(`at ${width.name}`, () => {
    test.use({ viewport: width.viewport });

    test("the Head hides Needed by, makes the department optional and moves the brand to the row; the sheet follows; a draft without both is submitted with a number; no Give straight to requester (05 Fields the Head sets)", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await writeFields(ORDER_FIELDS_DEFAULT);
      const scene = await newScene();
      try {
        await headSetsFields(page, scene);

        const draft = await bareDraft(scene, `Folders ${tag()}`);
        await as(page, scene.manager);
        await page.goto("/orders");
        const row = page.locator(`[data-draft="${draft.id}"]`);
        await expect(row).toBeVisible();
        // No needed-by cell anywhere; the brand stands in the row (05 rule 1 and 2).
        await expect(page.locator('[data-col="neededBy"]')).toHaveCount(0);
        await expect(page.locator("#add-needed-by")).toHaveCount(0);
        if (width.viewport.width >= 640) {
          await expect(row.locator('[data-col="company"]')).toBeVisible();
          await expect(row.locator('[data-col="requestedBy"]')).toBeVisible();
        }
        expect(await scrollsSideways(page)).toBe(false);

        await submitInGrid(page, scene, [{ ...draft, variantId: "" }]);
        expect(await statusOf(draft.id)).toBe("PENDING_HEAD");
        expect(await numberOf(draft.id)).toMatch(/-\d{2}-\d{4,}$/);

        // Open, as the approvals would leave it: the purchase form offers no Give straight to
        // requester on an order for no department (05 rule 3).
        await withDatabase((client) =>
          client.query(
            "update orders set status = 'PURCHASING', approved_at = now(), skipped_finance = true where id = $1",
            [draft.id],
          ),
        );
        await page.goto(`/orders/${draft.id}/purchase`);
        await expect(page.getByRole("button", { name: en.purchase.form.save })).toBeVisible();
        await expect(page.getByText(en.purchase.form.giveToRequester)).toHaveCount(0);
      } finally {
        await writeFields(ORDER_FIELDS_DEFAULT);
      }
    });
  });
}
