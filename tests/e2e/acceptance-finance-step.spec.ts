import { type Page, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  type Scene,
  as,
  confirmApprove,
  expect,
  financeApproves,
  labelOf,
  listAt,
  newScene,
  notebooks,
  numberOf,
  openApprove,
  recordPurchase,
  scrollsSideways,
  statusOf,
  submitInGrid,
  throughApprovals,
  withDatabase,
} from "./acceptance-fixtures";

// 15-quality-and-acceptance.md, S21 "Finance step off", clicked through as each role at 375 px
// and at 1440 px (build plan 4.10c, Done when; 06-approval-workflow.md, Finance step switched off;
// 11 Order page layout 2 and 3). The step is the whole school's, and every other browser test's
// approvals read it: this file is the project `finance-step`, the teardown of `start`, so it runs
// after every other test of the run, and its two widths one after the other
// (playwright.config.ts). Every order and person is its own; the plan of section 8: 100
// notebooks × 5 000 in cash plus 20 000 delivery, 520 000.

const f = en.settings.financeStep;
const m = en.orders.moves;

test.describe.configure({ mode: "serial" });

/** The step written straight, and no order of earlier tests left waiting for Finance. */
async function freshSchool(): Promise<void> {
  await withDatabase(async (client) => {
    // Every other test of the run has finished (the teardown project): what they left waiting
    // for Finance or for settlement would keep the step from being switched off (rule 5).
    await client.query("update orders set status = 'REJECTED' where status = 'PENDING_FINANCE'");
    await client.query("update orders set status = 'CLOSED' where status = 'SETTLEMENT'");
    await client.query(
      `insert into settings (key, value, created_at) values ('finance_step', 'true', now())
       on conflict (key) do update set value = excluded.value`,
    );
  });
}

/** The Head presses the block's button on /settings and confirms it. */
async function headSwitches(page: Page, scene: Scene, to: "off" | "on"): Promise<void> {
  await as(page, scene.head);
  await page.goto("/settings");
  const block = page.locator("[data-finance-step]");
  await expect(block).toHaveAttribute("data-finance-step", to === "off" ? "on" : "off");
  const press = to === "off" ? f.switchOff : f.switchOn;
  await block.getByRole("button", { name: press, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(to === "off" ? f.switchOffResult : f.switchOnResult);
  await dialog.getByRole("button", { name: press, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function overspendNoticesOf(userId: string): Promise<number> {
  return withDatabase(async (client) => {
    const found = await client.query<{ n: number }>(
      `select count(*)::int as n from notifications
        where user_id = $1 and type = 'OVERSPEND_ABOVE_GUARD'`,
      [userId],
    );
    return found.rows[0]!.n;
  });
}

/** The two widths every screen is checked at (01-summary.md, Quality bar). */
const WIDTHS = [
  { name: "375 px", viewport: { width: 375, height: 812 } },
  { name: "1440 px", viewport: { width: 1440, height: 900 } },
] as const;

for (const width of WIDTHS) {
  test.describe(`at ${width.name}`, () => {
    test.use({ viewport: width.viewport });

    test("S21: refused while an order waits for Finance and named; switched off once Finance approved it; the next order skips Finance, reads Skipped with no Money tab, is bought at 6 500 (Over 150 000) and closes with no settlement; switched on, the next order waits for Finance (15 S21)", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await freshSchool();
      const scene = await newScene();
      try {
        // One order waits for Finance: switching off is refused and names it, on the page too.
        const first = await notebooks(scene);
        await throughApprovals(page, scene, [first]);
        const number = await numberOf(first.id);
        await headSwitches(page, scene, "off");
        // An error toast holds its text twice (its title and its live line).
        await expect(page.getByText(f.refused.replace("{orders}", number)).first()).toBeVisible();
        await expect(page.locator("[data-finance-step-waiting]")).toContainText(number);
        await expect(page.locator("[data-finance-step]")).toHaveAttribute(
          "data-finance-step",
          "on",
        );
        expect(await scrollsSideways(page)).toBe(false);

        // Finance approves it; the second try switches the step off.
        await financeApproves(page, scene, [first], { [first.id]: "520000" });
        await headSwitches(page, scene, "off");
        await expect(page.getByText(f.switchedOff)).toBeVisible();
        await expect(page.locator("[data-finance-step]")).toHaveAttribute(
          "data-finance-step",
          "off",
        );

        // The second order goes from the Principal straight to Open; the dialog says so.
        const second = await notebooks(scene);
        await submitInGrid(page, scene, [second]);
        await as(page, scene.head);
        await listAt(page, scene, "PENDING_HEAD");
        await confirmApprove(page, await openApprove(page, [second]), 1);
        await as(page, scene.principal);
        await listAt(page, scene, "PENDING_PRINCIPAL");
        const dialog = await openApprove(page, [second]);
        // "Total {total}. The Finance step is switched off, so it opens for buying at once, …"
        await expect(dialog).toContainText(
          en.orders.approve.resultSkipFinance.split(", so")[0]!.replace("Total {total}. ", ""),
        );
        await confirmApprove(page, dialog, 1);
        expect(await statusOf(second.id)).toBe("PURCHASING");

        // Its page: Finance "Skipped", no Money tab.
        await as(page, scene.manager);
        await page.goto(`/orders/${second.id}`);
        await expect(page.locator('[data-step="FINANCE"]')).toHaveAttribute(
          "data-state",
          "skipped",
        );
        await expect(page.locator('[data-step="FINANCE"]')).toContainText(
          en.orders.page.stepper.skippedStep.replace(
            "{step}",
            en.orders.page.stepper.steps.FINANCE,
          ),
        );
        await expect(
          page.getByRole("link", { name: en.orders.page.tabs.purchases, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: en.orders.page.tabs.money, exact: true }),
        ).toHaveCount(0);
        expect(await scrollsSideways(page)).toBe(false);

        // Bought at 6 500 each: 670 000 against 520 000, Total red "Over 150 000".
        await recordPurchase(page, second, { price: "6500", comment: "Narx oshgan" });
        await expect(labelOf(page, "total")).toHaveAttribute("data-colour", "red");
        await expect(labelOf(page, "total")).toContainText(en.colourLabel.total.over);
        await expect(labelOf(page, "total")).toContainText(/150\s000/);

        // The Manager closes it: no settlement, no acknowledgment; the Head is told of the overspend.
        await page.locator('[data-move="CLOSE_SKIPPED"]').click();
        const close = page.getByRole("alertdialog");
        await expect(close).toContainText(m.closeConfirm);
        await close.getByRole("button", { name: m.button.CLOSE_SKIPPED, exact: true }).click();
        await expect(page.getByText("Closed 1 order.")).toBeVisible();
        expect(await statusOf(second.id)).toBe("CLOSED");
        expect(await overspendNoticesOf(scene.head.id)).toBe(1);

        // History: the Principal's approval says the Finance step was skipped.
        await page.goto(`/orders/${second.id}?tab=history`);
        await expect(page.locator("[data-skipped-finance]")).toHaveText(
          en.orders.page.history.financeSkipped,
        );

        // Switched on again: the next order the Principal approves waits for Finance.
        await headSwitches(page, scene, "on");
        await expect(page.getByText(f.switchedOn)).toBeVisible();
        const third = await notebooks(scene);
        await throughApprovals(page, scene, [third]);
        expect(await statusOf(third.id)).toBe("PENDING_FINANCE");
      } finally {
        await freshSchool();
      }
    });
  });
}
