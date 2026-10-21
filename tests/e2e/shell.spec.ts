import { type Page, expect, test } from "@playwright/test";

import ru from "../../src/i18n/messages/ru.json" with { type: "json" };
import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_BRANCHES, E2E_LANGUAGE_USERS, E2E_ROLES } from "./global-setup";

// Build-plan 0.10b, Done when: "Playwright at 375 px and 1440 px: each of the four roles sees
// exactly its menu items in the spec's order; the Principal has no Admin and no Money; changing
// the language on /profile changes the menu at once." 11-screens-and-ux.md: Interface per role,
// rules 1 (branch switcher, "All my branches"), 13 (keyboard, 44 px) and 15 (theme);
// docs/design-system.md: Layout shell (rail, kept in the browser), This app (Phone tab bar).
// Both widths are the two projects of playwright.config.ts.

/** 11-screens-and-ux.md, Interface per role, "Menu, in order", as the Uzbek words. */
const MENUS = {
  MANAGER: ["home", "orders", "warehouse", "analytics", "reports"],
  HEAD: ["home", "orders", "warehouse", "money", "analytics", "reports", "admin"],
  PRINCIPAL: ["home", "orders", "stock", "analytics", "reports"],
  FINANCE: ["home", "orders", "money", "stock", "analytics", "reports"],
} as const;

type Words = typeof uz.shell.menu;

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 640;
}

async function signIn(page: Page, user: { username: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(uz.login.username).fill(user.username);
  await page.getByLabel(uz.login.password).fill(user.password);
  await page.getByRole("button", { name: uz.login.submit }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** The menu's words as the person sees them: the sidebar, or the tab bar and its "More". */
async function menuWords(page: Page, words: Words): Promise<string[]> {
  const menu = page.locator("nav:visible");
  if (!isPhone(page)) {
    return menu
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("aria-label") ?? ""));
  }
  const tabs = await menu
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.textContent?.trim() ?? ""));
  const more = menu.getByRole("button", { name: words.more });
  if ((await more.count()) === 0) return tabs;
  // A click before the page has hydrated opens nothing: try again until the menu shows.
  await expect(async () => {
    if ((await page.getByRole("menu").count()) === 0) await more.click();
    await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 1000 });
  }).toPass();
  const rest = await page
    .getByRole("menuitem")
    .evaluateAll((items) => items.map((item) => item.textContent?.trim() ?? ""));
  await page.keyboard.press("Escape");
  return [...tabs, ...rest];
}

async function noSideScroll(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
}

for (const [role, items] of Object.entries(MENUS)) {
  test(`${role} sees exactly its menu items in the spec's order (11, Interface per role)`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role as keyof typeof E2E_ROLES]);

    const expected = items.map((id) => uz.shell.menu[id]);
    expect(await menuWords(page, uz.shell.menu)).toEqual(expected);
    if (isPhone(page) && items.length > 5) {
      // The first four, then "More" (design system, This app: Phone tab bar).
      await expect(page.locator("nav:visible").getByRole("link")).toHaveCount(4);
    }
    await expect(page.getByRole("heading", { level: 1, name: uz.home.title })).toBeVisible();
    await noSideScroll(page);
  });
}

test("the Principal has no Admin and no Money (build-plan 0.10b, Done when)", async ({ page }) => {
  await signIn(page, E2E_ROLES.PRINCIPAL);

  const words = await menuWords(page, uz.shell.menu);
  expect(words).not.toContain(uz.shell.menu.admin);
  expect(words).not.toContain(uz.shell.menu.money);
});

test("changing the language on /profile changes the menu at once, and it stays (A2; Done when)", async ({
  page,
}, testInfo) => {
  const user = E2E_LANGUAGE_USERS[testInfo.project.name as keyof typeof E2E_LANGUAGE_USERS];
  await signIn(page, user);
  await page.goto("/profile");
  expect(await menuWords(page, uz.shell.menu)).toContain(uz.shell.menu.orders);
  // A mark on the window: it survives a re-render, not a reload.
  await page.evaluate(() => Object.assign(window, { notReloaded: true }));

  await page.getByRole("radio", { name: ru.languages.ru }).click();

  await expect(page.getByRole("heading", { level: 1, name: ru.profile.title })).toBeVisible();
  expect(await menuWords(page, ru.shell.menu)).toContain(ru.shell.menu.orders);
  expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: ru.profile.title })).toBeVisible();

  await page.getByRole("radio", { name: uz.languages.uz }).click();
  await expect(page.getByRole("heading", { level: 1, name: uz.profile.title })).toBeVisible();
  expect(await menuWords(page, uz.shell.menu)).toContain(uz.shell.menu.orders);
  await noSideScroll(page);
});

test("the theme chosen on /profile is kept after a reload (11 rule 15)", async ({ page }) => {
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto("/profile");

  await page.getByRole("radio", { name: uz.theme.dark }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: uz.theme.dark })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.getByRole("radio", { name: uz.theme.device }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
});

test("the sidebar collapses to the rail, stays a rail after a reload, and is reached with Tab (design system, Layout shell; 11 rule 13)", async ({
  page,
}) => {
  test.skip(isPhone(page), "The rail is the sidebar's; phones have the tab bar.");
  await signIn(page, E2E_ROLES.HEAD);

  await page.getByRole("button", { name: uz.shell.collapse }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sidebar", "rail");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-sidebar", "rail");
  const expand = page.getByRole("button", { name: uz.shell.expand });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator("aside").evaluate((aside) => aside.getBoundingClientRect().width)).toBe(
    64,
  );

  // In the rail the current item is its icon on the light navy tint of the active item, corner 6,
  // with the small orange marker at its left edge (design system, Page shell; D60, 21.10.2026).
  const current = page.locator('aside a[aria-current="page"]');
  await expect(current).toHaveAttribute("aria-label", uz.shell.menu.home);
  await expect(current.locator("svg")).toBeVisible();
  const fill = await current.evaluate((link) => {
    const colourOf = (value: string) => {
      const probe = document.createElement("span");
      probe.style.background = value;
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    };
    const style = getComputedStyle(link);
    return {
      background: style.backgroundColor,
      tint: colourOf("var(--sidebar-primary)"),
      marker: getComputedStyle(link, "::before").backgroundColor,
      orange: colourOf("var(--brand)"),
      radius: style.borderRadius,
    };
  });
  expect(fill.background).toBe(fill.tint);
  expect(fill.marker).toBe(fill.orange);
  expect(fill.radius).toBe("6px");
  // The icon alone: the word is kept for screen readers only, so the item is rail-wide.
  expect((await current.boundingBox())!.width).toBeLessThanOrEqual(48);

  // Every rail item and the button carry their word and are reached with the keyboard.
  const reached = new Set<string>();
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    if (label) reached.add(label);
  }
  for (const id of MENUS.HEAD) expect(reached).toContain(uz.shell.menu[id]);
  expect(reached).toContain(uz.shell.expand);

  await expand.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", /./);
});

test("Finance with two branches gets All my branches by default and both branches (11 rule 1)", async ({
  page,
}) => {
  await signIn(page, E2E_ROLES.FINANCE);

  const select = page.getByLabel(uz.branch.label);
  await expect(select).toHaveValue("all");
  const options = await select
    .locator("option")
    .evaluateAll((all) => all.map((option) => option.textContent));
  expect(options).toEqual([
    uz.branch.all,
    `${E2E_BRANCHES[0].code} — ${E2E_BRANCHES[0].name}`,
    `${E2E_BRANCHES[1].code} — ${E2E_BRANCHES[1].name}`,
  ]);

  await select.selectOption({ label: `${E2E_BRANCHES[1].code} — ${E2E_BRANCHES[1].name}` });
  await expect(select).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel(uz.branch.label)).not.toHaveValue("all");
});

test("the Principal sees its branch's name and no select (11 rule 1)", async ({ page }) => {
  await signIn(page, E2E_ROLES.PRINCIPAL);

  await expect(
    page.getByText(`${E2E_BRANCHES[0].code} — ${E2E_BRANCHES[0].name}`, { exact: true }),
  ).toBeVisible();
  // Exact: the home's "Filialim …" sections are labelled by their titles too (plan of 6.1).
  await expect(page.getByLabel(uz.branch.label, { exact: true })).toHaveCount(0);
});

test("signed out, / goes to the sign-in page (plan of 0.10b)", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: uz.login.title })).toBeVisible();
});

test("a session that ended while its cookie stayed returns to the same page after sign-in (edge-cases/system.md)", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "procurement.session_token", value: "invented.ended", url: baseURL ?? "" },
  ]);
  await page.goto("/profile?tab=x");

  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%3Ftab%3Dx$/);
});

// Owner, 21.10.2026: "Profile page should instead be floating bar on the left when clicked." The
// person in the menu (the avatar of the top bar on a phone) opens the profile as a panel from the
// left; /profile stays for its address. The panel is the dialog named by the person's name.
test("the person's panel opens from the left with name, username, role, language, theme and sign-out, and Escape closes it", async ({
  page,
}) => {
  const head = E2E_ROLES.HEAD;
  await signIn(page, head);
  await page.goto("/orders");
  const trigger = page.locator("[data-profile-trigger]:visible");
  const panel = page.getByRole("dialog", { name: head.fullName });
  // A click before the page has hydrated opens nothing: try again until the panel shows.
  await expect(async () => {
    if (!(await panel.isVisible())) await trigger.click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();

  await expect(panel).toContainText(head.username);
  await expect(panel).toContainText(uz.roles.HEAD);
  await expect(panel.getByRole("radio", { name: uz.languages.uz })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(panel.getByRole("button", { name: uz.session.signOut })).toBeVisible();
  // Against the left edge, the full height of the screen.
  await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0);

  // The theme is chosen in the panel as on /profile, and the page stays where it was.
  await panel.getByRole("radio", { name: uz.theme.dark }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await panel.getByRole("radio", { name: uz.theme.device }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  await expect(page).toHaveURL(/\/orders$/);

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await noSideScroll(page);
});

// Owner, 21.10.2026: moving from tab to tab "is reloading the page kinda", and a tab low on the
// page jumped to the top. A tab and a filter form now keep the page where it stands, without a
// reload. The clicks go through the page, not Playwright's pointer, which would scroll the target
// into view first.
test("a report tab and the report filters keep the page where it is: no reload, no jump to the top", async ({
  page,
}) => {
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/reports");
  await page.waitForLoadState("networkidle");
  // Room below the page, so it can stand scrolled whatever the data; a mark that a reload clears.
  await page.evaluate(() => {
    document.body.style.paddingBottom = "3000px";
    Object.assign(window, { notReloaded: true });
  });
  const scrolledTo = async (y: number) => {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(y);
  };

  await scrolledTo(600);
  await page.evaluate(() =>
    document.querySelector<HTMLAnchorElement>('[data-report-tab="movements"]')!.click(),
  );
  await expect(page).toHaveURL(/report=movements/);
  await expect(page.locator('[data-report-tab="movements"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(600);

  await scrolledTo(600);
  await page.evaluate(() =>
    document
      .querySelector<HTMLFormElement>('form[role="search"][action="/reports"]')!
      .requestSubmit(),
  );
  await expect(page).toHaveURL(/report=movements&.*category=/);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(600);
  expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);
});
