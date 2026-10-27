import { type Page, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  type Scene,
  as,
  confirmApprove,
  expect,
  financeApproves,
  groupOf,
  insertDraft,
  listAt,
  newProduct,
  newScene,
  notebooks,
  numberOf,
  openApprove,
  scrollsSideways,
  statusOf,
  submitInGrid,
  tag,
  withDatabase,
} from "./acceptance-fixtures";
import { barAction } from "./order-bar";

// 15-quality-and-acceptance.md, S25 "Principal step off", clicked through as each role at 375 px
// and at 1440 px (build plan 4.10d, Done when; 06-approval-workflow.md, Principal step switched
// off; 03 rule 6; 11 Order page layout 3). The step is the whole school's, and every other browser
// test's approvals read it: this file is the project `principal-step`, the teardown of
// `finance-step`, so it runs after every other test of the run, and its two widths one after the
// other (playwright.config.ts; plan of 4.10d, decided item 17). Every order and person is its own;
// the plan of section 8: 100 notebooks × 5 000 in cash plus 20 000 delivery, 520 000. Before the
// fourth order the Principal and Finance decide the orders waiting at their steps, so both
// switches can go off (decisions 4.10d, taken during the build).

const p = en.settings.principalStep;
const f = en.settings.financeStep;
const o = en.orders;

test.describe.configure({ mode: "serial" });

/** Both steps on, and no order of earlier tests left waiting for the Principal or Finance. */
async function freshSchool(): Promise<void> {
  await withDatabase(async (client) => {
    // Every other test of the run has finished (the teardown project): what they left waiting
    // would keep a step from being switched off (06 Principal step switched off 4; Finance 5).
    await client.query(
      "update orders set status = 'REJECTED' where status in ('PENDING_PRINCIPAL', 'PENDING_FINANCE')",
    );
    await client.query("update orders set status = 'CLOSED' where status = 'SETTLEMENT'");
    for (const key of ["principal_step", "finance_step"]) {
      await client.query(
        `insert into settings (key, value, created_at) values ($1, 'true', now())
         on conflict (key) do update set value = excluded.value`,
        [key],
      );
    }
  });
}

/** The Head presses a step block's button on /settings and confirms it. */
async function headSwitches(
  page: Page,
  scene: Scene,
  step: "principal" | "finance",
  to: "off" | "on",
): Promise<void> {
  const texts = step === "principal" ? p : f;
  await as(page, scene.head);
  await page.goto("/settings");
  const block = page.locator(`[data-${step}-step]`);
  await expect(block).toHaveAttribute(`data-${step}-step`, to === "off" ? "on" : "off");
  const press = to === "off" ? texts.switchOff : texts.switchOn;
  await block.getByRole("button", { name: press, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(to === "off" ? texts.switchOffResult : texts.switchOnResult);
  await dialog.getByRole("button", { name: press, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** The Head approves the scene's Manager's orders on the list, the dialog saying where they go. */
async function headApproves(
  page: Page,
  scene: Scene,
  orders: { id: string; product: string; variantId: string }[],
  says: string,
) {
  await as(page, scene.head);
  await listAt(page, scene, "PENDING_HEAD");
  const dialog = await openApprove(page, orders);
  await expect(dialog).toContainText(says);
  await confirmApprove(page, dialog, orders.length);
}

/** The Principal step of the order's stepper, which heads its History tab (plan of 2.9b). */
async function principalStepOf(page: Page, orderId: string) {
  await page.goto(`/orders/${orderId}?tab=history`);
  return page.locator('[data-step="PRINCIPAL"]');
}

/** The end of the Head's Approve sentence with the step on: "… and the next approver is told." */
const NEXT_TOLD = "the next approver is told";

const SKIPPED = o.page.stepper.skippedStep.replace("{step}", o.page.stepper.steps.PRINCIPAL);

/** The two widths every screen is checked at (01-summary.md, Quality bar). */
const WIDTHS = [
  { name: "375 px", viewport: { width: 375, height: 812 } },
  { name: "1440 px", viewport: { width: 1440, height: 900 } },
] as const;

for (const width of WIDTHS) {
  test.describe(`at ${width.name}`, () => {
    test.use({ viewport: width.viewport });

    test("S25: refused while an order waits for the Principal and named; switched off once the Principal approved it; the Head's approval and own Submit go to Finance, Skipped and Created by Head; sent back and approved again with the step on, it waits for the Principal; with both steps off the Head opens the fourth (15 S25)", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await freshSchool();
      const scene = await newScene();
      try {
        // One order waits for the Principal: switching off is refused and names it.
        const first = await notebooks(scene);
        await submitInGrid(page, scene, [first]);
        await headApproves(page, scene, [first], NEXT_TOLD);
        const number = await numberOf(first.id);
        await headSwitches(page, scene, "principal", "off");
        // An error toast holds its text twice (its title and its live line).
        await expect(page.getByText(p.refused.replace("{orders}", number)).first()).toBeVisible();
        await expect(page.locator("[data-principal-step-waiting]")).toContainText(number);
        await expect(page.locator("[data-principal-step]")).toHaveAttribute(
          "data-principal-step",
          "on",
        );
        expect(await scrollsSideways(page)).toBe(false);

        // The Principal approves it; the second try switches the step off.
        await as(page, scene.principal);
        await listAt(page, scene, "PENDING_PRINCIPAL");
        await confirmApprove(page, await openApprove(page, [first]), 1);
        await headSwitches(page, scene, "principal", "off");
        await expect(page.getByText(p.switchedOff)).toBeVisible();
        await expect(page.locator("[data-principal-step]")).toHaveAttribute(
          "data-principal-step",
          "off",
        );

        // With the Finance step on, the Head approves a second order: straight to Finance.
        const second = await notebooks(scene);
        await submitInGrid(page, scene, [second]);
        await headApproves(
          page,
          scene,
          [second],
          o.approve.resultSkipPrincipal.split(", so")[0]!.replace("Total {total}. ", ""),
        );
        expect(await statusOf(second.id)).toBe("PENDING_FINANCE");

        // The Head creates and submits a third: straight to Finance, its Head step "Created by Head".
        const product = `Daftar ${tag()}`;
        const third = await insertDraft(
          scene.head,
          scene.branch.id,
          await newProduct(product, 5000),
          scene.department,
          100,
          5000,
        );
        await page.goto("/orders");
        await page.getByRole("checkbox", { name: o.tickRow.replace("{product}", product) }).check();
        await page.getByRole("button", { name: o.submit.button.replace("{count}", "1") }).click();
        const submit = page.getByRole("alertdialog");
        await submit.getByRole("button", { name: o.submit.confirm, exact: true }).click();
        await expect(page.getByText(/Submitted 1 order/)).toBeVisible();
        expect(await statusOf(third)).toBe("PENDING_FINANCE");

        // Both steppers read Principal "Skipped"; the History tab says why.
        await as(page, scene.manager);
        const secondStep = await principalStepOf(page, second.id);
        await expect(secondStep).toHaveAttribute("data-state", "skipped");
        await expect(secondStep).toContainText(SKIPPED);
        await expect(page.locator("[data-skipped-principal]")).toHaveText(
          o.page.history.principalSkipped,
        );
        expect(await scrollsSideways(page)).toBe(false);
        await as(page, scene.head);
        const thirdStep = await principalStepOf(page, third);
        await expect(thirdStep).toHaveAttribute("data-state", "skipped");
        await expect(page.locator("[data-created-by-head]")).toHaveText(
          o.page.history.createdByHead,
        );

        // The Principal's approval list is empty: no skipped order waits there.
        await as(page, scene.principal);
        await page.goto("/orders?status=PENDING_PRINCIPAL");
        await expect(groupOf(page, second.product)).toHaveCount(0);
        await expect(groupOf(page, product)).toHaveCount(0);

        // Finance sends the second back.
        await as(page, scene.finance);
        await page.goto(`/orders/${second.id}`);
        await (
          await barAction(
            page,
            page
              .locator("[data-order-bar]")
              .getByRole("button", { name: o.moves.button.SEND_BACK, exact: true }),
          )
        ).click();
        const back = page.getByRole("alertdialog");
        await back.locator("textarea[data-reason]").fill("Narxni tekshiring");
        await back.getByRole("button", { name: o.moves.button.SEND_BACK, exact: true }).click();
        await expect(page.getByText("Sent back 1 order.")).toBeVisible();

        // The Head switches the Principal step on; the Manager submits it again; the Head approves
        // it: it waits for the Principal and its stepper no longer reads "Skipped".
        await headSwitches(page, scene, "principal", "on");
        await expect(page.getByText(p.switchedOn)).toBeVisible();
        await as(page, scene.manager);
        await page.goto("/orders");
        await page.locator(`tbody tr[data-draft="${second.id}"] [data-tick] input`).check();
        await page
          .getByRole("button", { name: o.submit.againButton.replace("{count}", "1") })
          .click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: o.moves.button.SUBMIT_AGAIN, exact: true })
          .click();
        await expect(page.getByText("Submitted 1 order again.")).toBeVisible();
        await headApproves(page, scene, [second], NEXT_TOLD);
        expect(await statusOf(second.id)).toBe("PENDING_PRINCIPAL");
        await as(page, scene.manager);
        const again = await principalStepOf(page, second.id);
        await expect(again).toHaveAttribute("data-state", "current");

        // The Principal decides the second and Finance the orders waiting for it; then both steps
        // go off.
        await as(page, scene.principal);
        await listAt(page, scene, "PENDING_PRINCIPAL");
        await confirmApprove(page, await openApprove(page, [second]), 1);
        await financeApproves(page, scene, [first, second], {});
        await withDatabase((client) =>
          client.query("update orders set status = 'REJECTED' where id = $1", [third]),
        );
        await headSwitches(page, scene, "principal", "off");
        await headSwitches(page, scene, "finance", "off");

        // The Head approves a fourth: straight to Open, Principal and Finance "Skipped", no Money
        // tab and no cash count.
        const fourth = await notebooks(scene);
        await submitInGrid(page, scene, [fourth]);
        await headApproves(
          page,
          scene,
          [fourth],
          o.approve.resultSkipBoth.split(", so")[0]!.replace("Total {total}. ", ""),
        );
        expect(await statusOf(fourth.id)).toBe("PURCHASING");
        await as(page, scene.manager);
        await page.goto(`/orders/${fourth.id}`);
        await expect(page.getByRole("link", { name: o.page.tabs.money, exact: true })).toHaveCount(
          0,
        );
        const fourthStep = await principalStepOf(page, fourth.id);
        await expect(fourthStep).toHaveAttribute("data-state", "skipped");
        await expect(page.locator('[data-step="FINANCE"]')).toHaveAttribute(
          "data-state",
          "skipped",
        );
        expect(await scrollsSideways(page)).toBe(false);

        // The Principal's approval list stayed empty for every skipped order.
        await as(page, scene.principal);
        await page.goto("/orders?status=PENDING_PRINCIPAL");
        await expect(groupOf(page, fourth.product)).toHaveCount(0);
      } finally {
        await freshSchool();
      }
    });
  });
}
