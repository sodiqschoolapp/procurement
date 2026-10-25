import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { inTransaction, withDatabase } from "./acceptance-fixtures";
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.12 and 1.12b: suggestions sent before 25 October 2026 are decided as before: the
// Head adds one to the catalog, edited, or declines it with a reason, and the Manager is told
// (04-catalogs.md rule 8; 10, Notifications: "Product suggestion decided"; plan of 1.12b, decided
// item 3, Look first: no new suggestion is sent). Both projects share one database, so every name
// is new on every run.

type Person = (typeof E2E_ROLES)[keyof typeof E2E_ROLES];

const t = uz.suggestions;
const c = uz.catalog;

async function signIn(page: Page, user: Person): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(uz.login.username).fill(user.username);
  await page.getByLabel(uz.login.password).fill(user.password);
  await page.getByRole("button", { name: uz.login.submit }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function noSideScroll(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
}

/**
 * A suggestion the Manager sent before 25 October 2026, pending, in the Manager's branch, as
 * suggestProduct wrote it (04 rule 8: "Suggestions sent before 25 October 2026 are decided as
 * before"; plan of 1.12b, decided item 3): its row and its audit row. Returns its page.
 */
async function sentBefore(name: string): Promise<string> {
  return withDatabase((client) =>
    inTransaction(client, async () => {
      const made = await client.query<{ id: string; branch_id: string; code: string }>(
        `insert into catalog_suggestions (branch_id, suggested_by, name, unit_text, note, status,
                                          client_key, created_at)
         select ub.branch_id, u.id, $1, 'quti', 'Kimyo xonasi uchun', 'PENDING', gen_random_uuid(),
                '2026-10-20T08:00:00Z'
           from users u join user_branches ub on ub.user_id = u.id
          where u.username = $2
          order by ub.branch_id limit 1
         returning id, branch_id, (select code from branches where id = branch_id) as code`,
        [name, E2E_ROLES.MANAGER.username],
      );
      const row = made.rows[0]!;
      await client.query(
        `insert into audit_log (actor_id, action, entity, entity_id, before, after, created_at)
         select id, 'suggestion.create', 'catalog_suggestions', $1, null, $2, '2026-10-20T08:00:00Z'
           from users where username = $3`,
        [
          row.id,
          JSON.stringify({
            branchId: row.branch_id,
            branch: row.code,
            name,
            unitText: "quti",
            note: "Kimyo xonasi uchun",
            photoFileId: null,
            photo: null,
            status: "PENDING",
          }),
          E2E_ROLES.MANAGER.username,
        ],
      );
      return `/suggestions/${row.id}`;
    }),
  );
}

test("suggestions sent before 25 October 2026: the Head adds one edited and declines another with a reason; the Manager is told (04 rule 8; build-plan 1.12, 1.12b)", async ({
  page,
}) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const category = `Laboratoriya ${suffix}`;
  const measure = `Quti ${suffix}`;
  const added = `Probirka ${suffix}`;
  const declined = `Kolba ${suffix}`;

  // The Head's category and measure to pick at the add (1.5).
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/catalog/categories/new");
  await expect(page.getByRole("button", { name: c.save })).toBeEnabled();
  await page.getByLabel(c.fields.name).fill(category);
  await page.getByRole("button", { name: c.save }).click();
  await expect(page).toHaveURL(/\/catalog\/categories\/[0-9a-f-]{36}$/);
  await page.goto("/catalog/measures/new");
  await expect(page.getByRole("button", { name: c.save })).toBeEnabled();
  await page.getByLabel(c.fields.name, { exact: true }).fill(measure);
  await page.getByLabel(c.fields.shortName).fill(`q${suffix}`);
  await page.getByRole("button", { name: c.save }).click();
  await expect(page).toHaveURL(/\/catalog\/measures\/[0-9a-f-]{36}$/);

  // Two suggestions the Manager sent before 25 October 2026; no new one can be sent.
  const first = await sentBefore(added);
  const second = await sentBefore(declined);
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto(first);
  await expect(page.getByRole("heading", { name: added, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: t.add })).toHaveCount(0);
  expect((await page.goto("/suggestions/new"))?.status()).toBe(404);

  // The Head adds the first with a changed name.
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/catalog");
  await expect(page.getByRole("link", { name: new RegExp(c.suggestionsRow.title) })).toBeVisible();
  await page.goto(first);
  await page.getByRole("link", { name: t.add }).click();
  await expect(page.getByRole("heading", { name: t.addTitle, level: 1 })).toBeVisible();
  await expect(page.getByText(t.askedMeasure.replace("{unit}", "quti"))).toBeVisible();
  await expect(page.getByLabel(c.fields.name)).toHaveValue(added);
  await expect(page.getByRole("button", { name: c.save })).toBeEnabled();
  await page.getByLabel(c.fields.name).fill(`${added} 10 ml`);
  await page.getByLabel(c.fields.categoryId).selectOption({ label: category });
  await page.getByLabel(c.fields.unitId).selectOption({ label: measure });
  await noSideScroll(page);
  await page.getByRole("button", { name: c.save }).click();
  await expect(page.getByText(t.added).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${first}$`));
  await expect(page.getByRole("main").getByText(t.status.ADDED)).toBeVisible();
  await expect(page.getByRole("link", { name: `${added} 10 ml` })).toBeVisible();

  // The Head declines the second with a reason, after the confirmation.
  await page.goto(second);
  await page.getByLabel(t.fields.reason).fill("Omborda yetarli");
  await page.getByRole("button", { name: t.decline }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: t.decline }).click();
  await expect(page.getByText(t.declined).first()).toBeVisible();
  await expect(page.getByRole("main").getByText(t.status.DECLINED)).toBeVisible();
  await expect(page.getByText("Omborda yetarli")).toBeVisible();
  await noSideScroll(page);

  // The Manager is told of both decisions and sees them in the list.
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto("/notifications");
  await expect(page.getByText(new RegExp(`${added}.*katalogga qoʻshildi`)).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`${declined}.*rad etildi`)).first()).toBeVisible();
  await page.goto("/suggestions");
  await expect(page.getByRole("heading", { name: t.title, level: 1 })).toBeVisible();
  await expect(page.getByText(added).filter({ visible: true }).first()).toBeVisible();
  await noSideScroll(page);
});

for (const role of ["PRINCIPAL", "FINANCE"] as const) {
  test(`${role} gets not found on the suggestion pages (03, Permission matrix: "See product suggestions")`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of ["/suggestions"]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}
