import { type Page, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { ORDER_FIELDS_DEFAULT } from "../../src/domain/order-fields";
import {
  type Scene,
  as,
  confirmApprove,
  expect,
  labelOf,
  listAt,
  newProduct,
  newScene,
  notebooks,
  numberOf,
  openApprove,
  recordPurchase,
  scrollsSideways,
  statusOf,
  submitInGrid,
  tag,
  throughApprovals,
  withDatabase,
} from "./acceptance-fixtures";

// The fields the Head sets, clicked through at 375 px and 1440 px (build plan 2.5d, Done when;
// 05-order-request-form.md, Fields the Head sets 1 to 4; plan of 2.5d-a: every field but the
// price), and S24 with the price (build plan 2.5d-b, Done when; 15 S24; 06 Finance step switched
// off 8). The setting is the whole school's, and every other browser test's sheet reads it: this
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
async function headSetsFields(page: Page, scene: Scene, financeStep = true): Promise<void> {
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
  // With the Finance step on the price offers Required only; off, all three (06 Finance step
  // switched off 8).
  await expect(
    block
      .getByRole("combobox", { name: of.askLabel.replace("{field}", of.field.price) })
      .locator("option"),
  ).toHaveCount(financeStep ? 1 : 3);
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

const unpriced = en.orders.unpriced.none;

/** The school as every other test leaves it: the defaults, the Finance step on, nothing waiting. */
async function freshSchool(): Promise<void> {
  await withDatabase(async (client) => {
    await client.query("update orders set status = 'REJECTED' where status = 'PENDING_FINANCE'");
    await client.query("update orders set status = 'CLOSED' where status = 'SETTLEMENT'");
    await client.query(
      `update orders set status = 'REJECTED'
        where status in ('PENDING_HEAD', 'PENDING_PRINCIPAL') and planned_price is null`,
    );
    await client.query(
      `insert into settings (key, value, created_at) values ('finance_step', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(true)],
    );
  });
  await writeFields(ORDER_FIELDS_DEFAULT);
}

/** The Head's switch on /settings, pressed and confirmed. */
async function headSwitchesOn(page: Page, scene: Scene): Promise<void> {
  await as(page, scene.head);
  await page.goto("/settings");
  const block = page.locator("[data-finance-step]");
  await expect(block).toHaveAttribute("data-finance-step", "off");
  const press = en.settings.financeStep.switchOn;
  await block.getByRole("button", { name: press, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: press, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** The Head sets how the price is asked on /settings and saves. */
async function headSetsPrice(page: Page, ask: "optional" | "required"): Promise<void> {
  await page.goto("/settings");
  const block = page.locator("[data-order-fields]");
  await block
    .getByRole("combobox", { name: of.askLabel.replace("{field}", of.field.price) })
    .selectOption(ask);
  await block.getByRole("button", { name: of.save }).click();
  await expect(page.getByText(of.saved).first()).toBeVisible();
}

for (const width of WIDTHS) {
  test.describe(`S24 at ${width.name}`, () => {
    test.use({ viewport: width.viewport });

    test("S24: with the Finance step off, 10 folders with no department and no price are submitted, read No planned price, are bought for 45 000 and closed with no overspend notice; the switch on is refused until the price is required, then the next order waits for Finance (15 S24)", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await freshSchool();
      await withDatabase((client) =>
        client.query(
          `insert into settings (key, value, created_at) values ('finance_step', $1::jsonb, now())
           on conflict (key) do update set value = excluded.value`,
          [JSON.stringify(false)],
        ),
      );
      const scene = await newScene();
      try {
        // The Head hides Needed by and makes department and price optional.
        await headSetsFields(page, scene, false);
        await headSetsPrice(page, "optional");

        // 10 folders with no department and no price; the sheet has no needed-by cell.
        const product = `Folders ${tag()}`;
        const variantId = await newProduct(product, null);
        const id = await withDatabase(async (client) => {
          const made = await client.query<{ id: string }>(
            `insert into orders (branch_id, owner_id, created_by, variant_id, planned_qty,
                                 payment_type, created_at, updated_at)
             values ($1, $2, $2, $3, 10, 'CASH', now(), now()) returning id`,
            [scene.branch.id, scene.manager.id, variantId],
          );
          return made.rows[0]!.id;
        });
        const folders = { id, product, variantId };
        await submitInGrid(page, scene, [folders]);
        await expect(page.locator('[data-col="neededBy"]')).toHaveCount(0);
        expect(await statusOf(id)).toBe("PENDING_HEAD");
        expect(await numberOf(id)).toMatch(/-\d{2}-\d{4,}$/);

        // Approvers read "No planned price": the approve dialog and the order page.
        await as(page, scene.head);
        await listAt(page, scene, "PENDING_HEAD");
        const dialog = await openApprove(page, [folders]);
        await expect(dialog).toContainText(unpriced);
        await confirmApprove(page, dialog, 1);
        await as(page, scene.principal);
        await page.goto(`/orders/${id}`);
        await expect(page.locator("[data-plan-actual]")).toContainText(unpriced);
        expect(await scrollsSideways(page)).toBe(false);
        await listAt(page, scene, "PENDING_PRINCIPAL");
        await confirmApprove(page, await openApprove(page, [folders]), 1);
        expect(await statusOf(id)).toBe("PURCHASING");

        // "Give straight to requester" is not offered; bought for 45 000.
        await as(page, scene.manager);
        await page.goto(`/orders/${id}/purchase`);
        await expect(page.locator("[data-planned-price]")).toHaveText(unpriced);
        await expect(page.getByText(en.purchase.form.giveToRequester)).toHaveCount(0);
        await recordPurchase(page, folders, { price: "4500" });

        // Number green; Price and Total read No planned price; the actual total is 45 000.
        await expect(labelOf(page, "number")).toHaveAttribute("data-colour", "green");
        await expect(labelOf(page, "price")).toHaveAttribute("data-colour", "unpriced");
        await expect(labelOf(page, "price")).toContainText(unpriced);
        await expect(labelOf(page, "total")).toHaveAttribute("data-colour", "unpriced");
        await expect(page.locator('[data-plan-line="total"]')).toContainText(/45\s000/);
        expect(await scrollsSideways(page)).toBe(false);

        // The Manager closes it; no overspend notice is sent.
        await page.locator('[data-move="CLOSE_SKIPPED"]').click();
        const close = page.getByRole("alertdialog");
        await close
          .getByRole("button", { name: en.orders.moves.button.CLOSE_SKIPPED, exact: true })
          .click();
        await expect(page.getByText("Closed 1 order.")).toBeVisible();
        expect(await statusOf(id)).toBe("CLOSED");
        const notices = await withDatabase(async (client) => {
          const found = await client.query<{ n: number }>(
            `select count(*)::int as n from notifications
              where user_id = $1 and type = 'OVERSPEND_ABOVE_GUARD'`,
            [scene.head.id],
          );
          return found.rows[0]!.n;
        });
        expect(notices).toBe(0);

        // The first switch on is refused because the price is not required.
        await headSwitchesOn(page, scene);
        await expect(
          page.getByText(en.errors.field.financeStepPriceNotRequired).first(),
        ).toBeVisible();
        await expect(page.locator("[data-finance-step]")).toHaveAttribute(
          "data-finance-step",
          "off",
        );
        // The Head makes the price required; the second goes through.
        await headSetsPrice(page, "required");
        await headSwitchesOn(page, scene);
        await expect(page.getByText(en.settings.financeStep.switchedOn)).toBeVisible();

        // The next order the Principal approves waits for Finance.
        const next = await notebooks(scene);
        await throughApprovals(page, scene, [next]);
        expect(await statusOf(next.id)).toBe("PENDING_FINANCE");
      } finally {
        await freshSchool();
      }
    });
  });
}
