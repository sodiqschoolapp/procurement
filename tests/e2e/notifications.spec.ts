import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_NOTIFICATION_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build-plan 0.11, Done when (the by-hand check, automated): "the bell shows 1, opening it follows
// the link and the count falls to 0". 10-notifications-analytics-reports.md, Notifications;
// 11-screens-and-ux.md, Screens (/notifications) and rule 13; plan of 0.11, decision 8 ("Mark
// all as read"). Each project has its own Head (review of the plan, Must fix 2). The e2e database
// is kept between runs and its notifications cannot be deleted (decision 3), so each test first
// marks that Head's earlier ones read, the one change the trigger allows. Moments come from the
// database's now() (review of the plan, correction 2).

// The two tests use the same person: one after the other (fullyParallel would run them together).
test.describe.configure({ mode: "serial" });

type Person = (typeof E2E_NOTIFICATION_USERS)[keyof typeof E2E_NOTIFICATION_USERS];

async function withDatabase<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const address = e2eDatabaseUrl(serverDatabaseUrl());
  const client = new pg.Client(connectionOptions(address, process.env.DATABASE_CA_CERT));
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Marks the person's earlier notifications read and gives them `count` new ones to `link`. */
async function freshNotifications(person: Person, count: number, link: string): Promise<void> {
  await withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "select id from users where username = $1",
      [person.username],
    );
    const userId = rows[0]!.id;
    await client.query(
      "update notifications set read_at = now() where user_id = $1 and read_at is null",
      [userId],
    );
    for (let index = 0; index < count; index += 1) {
      await client.query(
        `insert into notifications (user_id, type, params, link, created_at)
         values ($1, 'BRANCH_ROLE_VACANT', '{"branch":"EA","role":"PRINCIPAL"}', $2, now())`,
        [userId, link],
      );
    }
  });
}

async function signIn(page: Page, user: Person): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(uz.login.username).fill(user.username);
  await page.getByLabel(uz.login.password).fill(user.password);
  await page.getByRole("button", { name: uz.login.submit }).click();
  await expect(page).toHaveURL(/\/$/);
}

function personOf(projectName: string): Person {
  return E2E_NOTIFICATION_USERS[projectName as keyof typeof E2E_NOTIFICATION_USERS];
}

async function noSideScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.view);
}

test("the bell shows 1; opening the notification follows its link and the count falls to 0 (Done when)", async ({
  page,
}, testInfo) => {
  const person = personOf(testInfo.project.name);
  await freshNotifications(person, 1, "/profile");
  await signIn(page, person);

  const bell = page.getByTestId("bell");
  await expect(bell).toHaveText("1");
  const box = await bell.boundingBox();
  // 44 px touch target on a phone (11 rule 13), 40 on a desktop (Buttons).
  expect(box!.height).toBeGreaterThanOrEqual(testInfo.project.name === "phone-375" ? 44 : 40);

  await bell.click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: uz.notifications.title })).toBeVisible();
  const unread = page.locator('[data-testid="notification"][data-unread="true"]');
  await expect(unread).toHaveCount(1);
  await expect(unread.getByText(uz.notifications.unread)).toBeVisible();
  await expect(unread).toContainText("EA");
  await noSideScroll(page);

  // A click before hydration does nothing: try again until the page changes.
  await expect(async () => {
    if (/\/notifications$/.test(page.url())) await unread.first().click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 2000 });
  }).toPass();
  await expect(page.getByTestId("bell")).toHaveText("");
});

test("Mark all as read empties the count (plan of 0.11, decision 8)", async ({
  page,
}, testInfo) => {
  const person = personOf(testInfo.project.name);
  await signIn(page, person);
  await freshNotifications(person, 2, "/");
  await page.goto("/notifications");
  await expect(page.getByTestId("bell")).toHaveText("2");
  await expect(page.locator('[data-testid="notification"][data-unread="true"]')).toHaveCount(2);

  await expect(async () => {
    const button = page.getByRole("button", { name: uz.notifications.markAllRead });
    if ((await button.count()) > 0) await button.click();
    await expect(page.getByTestId("bell")).toHaveText("", { timeout: 2000 });
  }).toPass();
  await expect(page.locator('[data-testid="notification"][data-unread="true"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: uz.notifications.markAllRead })).toHaveCount(0);
  await noSideScroll(page);
});
