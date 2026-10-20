import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, type Page, test as base } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  type Planned,
  type Scene,
  as,
  confirmApprove,
  expect,
  financeApproves,
  listAt,
  moveOnList,
  newProductWithSubtypes,
  newScene,
  notebooks,
  openApprove,
  planOf,
  recordPurchase,
  submitInGrid,
  tag,
  withDatabase,
} from "./acceptance-fixtures";
import { SCREENS, type ScreenIds, type Who, appRoutes } from "./screens";

// Build plan 9.1d, the accessibility pass (the former 8.3, D47): every screen of src/app at 375 px
// and 1440 px (the two projects), in the light and the dark theme, checked by axe on the WCAG 2.0
// and 2.1 A and AA rules, with no serious or critical finding (Done when; plan of 9.1d, decided
// items 3 and 4); every control a finger uses at least 44 × 44 at 375 px (decided item 6); and a
// Tab walk of every screen: each focusable reached until focus wraps, each with a visible focus
// indicator, <main> within 40 presses, no trap (decided item 7). 11-screens-and-ux.md rule 13;
// docs/design-system.md, Buttons and Accessibility. One test per screen and role, so the four CI
// shards share them (review correction 1).

type World = {
  scene: Scene;
  draft: Planned;
  waiting: Planned;
  open: Planned;
  settling: Planned;
  product: string;
  subtype: string;
  unit: string;
  suggestion: string;
  document: string;
  states: Record<Who, Awaited<ReturnType<BrowserContext["storageState"]>>>;
};

// The canvas, --background, of the dark theme (docs/design-system.md, Colour).
const DARK_CANVAS = "#040920";

/**
 * The records the detail screens open, made once per worker: a branch of its own with one person
 * of each role (newScene()), a draft, an order Waiting for Head, an Open order and one Waiting for
 * settlement, each moved there through the screens, a product with subtypes, a suggestion and an
 * issue note.
 */
async function makeWorld(
  browser: Browser,
  options: { viewport: { width: number; height: number }; baseURL?: string },
) {
  const scene = await newScene();
  const draft = await notebooks(scene);
  const waiting = await planOf(scene, `Ruchka ${tag()}`, 20, 3000);
  const open = await planOf(scene, `Qog'oz ${tag()}`, 10, 40000);
  const settling = await planOf(scene, `Marker ${tag()}`, 10, 5000);

  const context = await browser.newContext(options);
  const page = await context.newPage();
  await submitInGrid(page, scene, [waiting, open, settling]);
  for (const [approver, status] of [
    [scene.head, "PENDING_HEAD"],
    [scene.principal, "PENDING_PRINCIPAL"],
  ] as const) {
    await as(page, approver);
    await listAt(page, scene, status);
    await confirmApprove(page, await openApprove(page, [open, settling]), 2);
  }
  await financeApproves(page, scene, [open, settling], {});
  await as(page, scene.manager);
  await recordPurchase(page, settling, { price: "4500", comment: "Arzonroq topildi" });
  await listAt(page, scene, "PURCHASING");
  await moveOnList(page, [settling], "SEND_TO_SETTLEMENT", "Sent 1 order to settlement.");
  await context.close();

  const [subtype] = await newProductWithSubtypes(`Bo'yoq ${tag()}`, 12000, ["Qizil", "Ko'k"]);
  const ids = await withDatabase(async (client) => {
    const product = await client.query<{ product: string; unit: string }>(
      `select p.id as product, p.unit_id as unit
         from product_variants v join products p on p.id = v.product_id where v.id = $1`,
      [subtype],
    );
    const suggestion = await client.query<{ id: string }>(
      `insert into catalog_suggestions (branch_id, suggested_by, name, unit_text, status,
                                        created_at)
       values ($1, $2, $3, 'dona', 'PENDING', now()) returning id`,
      [scene.branch.id, scene.manager.id, `Taklif ${tag()}`],
    );
    // One issue note of 1 of the bought markers, written as postMovement() writes it (as
    // warehouse-documents.spec.ts sets up its issues).
    await client.query("begin");
    const document = await client.query<{ id: string }>(
      `insert into stock_documents (number, type, branch_id, department_id, received_by_name,
         doc_date, status, client_key, created_by, created_at)
       values ($1, 'ISSUE', $2, $3, 'Sinov Qabulqiluvchi',
         (now() at time zone 'Asia/Tashkent')::date, 'POSTED', gen_random_uuid(), $4, now())
       returning id`,
      [
        `ISS-${scene.branch.code}-26-${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`,
        scene.branch.id,
        scene.department,
        scene.manager.id,
      ],
    );
    const line = await client.query<{ id: string }>(
      `insert into stock_document_lines (document_id, variant_id, qty, created_at)
       values ($1, $2, 1, now()) returning id`,
      [document.rows[0]!.id, settling.variantId],
    );
    await client.query(
      `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                    balance_after, document_line_id, created_by, created_at)
       values ($1, $2, 'ISSUE', -1, 4500, 9, $3, $4, now())`,
      [scene.branch.id, settling.variantId, line.rows[0]!.id, scene.manager.id],
    );
    await client.query(
      "update stock_balances set qty = 9 where branch_id = $1 and variant_id = $2",
      [scene.branch.id, settling.variantId],
    );
    await client.query("commit");
    return {
      product: product.rows[0]!.product,
      unit: product.rows[0]!.unit,
      suggestion: suggestion.rows[0]!.id,
      document: document.rows[0]!.id,
    };
  });

  const states = {} as World["states"];
  for (const who of ["head", "manager", "principal", "finance"] as const) {
    const signed = await browser.newContext(options);
    const page = await signed.newPage();
    await as(page, scene[who]);
    states[who] = await signed.storageState();
    await signed.close();
  }
  return { scene, draft, waiting, open, settling, subtype: subtype!, states, ...ids };
}

const test = base.extend<object, { world: World }>({
  world: [
    async ({ browser }, use, info) => {
      const { viewport, baseURL } = info.project.use;
      await use(await makeWorld(browser, { viewport: viewport!, baseURL }));
    },
    { scope: "worker", timeout: 240_000 },
  ],
});

test("every screen of src/app is in the accessibility check (build plan 9.1d: every screen)", () => {
  expect(appRoutes()).toEqual([...new Set(SCREENS.map((screen) => screen.route))].sort());
});

async function open(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect(response?.ok()).toBe(true);
  await page.waitForLoadState("networkidle");
  // A refused address redirects (the analytics drill-downs) or shows "Not found": neither is the
  // screen asked for.
  expect(new URL(page.url()).pathname).toBe(new URL(url, "http://x").pathname);
  await expect(page.getByRole("heading", { name: en.notFoundPage.title })).toHaveCount(0);
}

async function canvas(page: Page): Promise<string> {
  return page.evaluate(() => {
    const paint = document.createElement("canvas");
    paint.width = 1;
    paint.height = 1;
    const context = paint.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
  });
}

/** axe on WCAG 2.0 and 2.1 A and AA: serious and critical fail, the rest is attached (D37). */
async function axe(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const lines = (impacts: string[]) =>
    result.violations
      .filter((violation) => impacts.includes(violation.impact ?? ""))
      .map((violation) => ({
        rule: violation.id,
        impact: violation.impact,
        help: violation.help,
        elements: violation.nodes.map((node) => node.target.join(" ")),
      }));
  const minor = lines(["moderate", "minor"]);
  if (minor.length > 0) {
    await test.info().attach(`axe ${label} moderate and minor`, {
      body: JSON.stringify(minor, null, 2),
      contentType: "application/json",
    });
  }
  expect(lines(["serious", "critical"]), `axe on ${label}`).toEqual([]);
}

/** The controls under 44 × 44 at phone width (design system, Buttons; decided item 6). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const controls = [
      "a[href]",
      "button",
      "input:not([type=hidden])",
      "select",
      "textarea",
      "summary",
      ...["button", "checkbox", "radio", "tab", "switch", "menuitem", "link", "combobox"].map(
        (role) => `[role=${role}]`,
      ),
    ].join(",");
    const small: string[] = [];
    for (const control of document.querySelectorAll<HTMLElement>(controls)) {
      const box = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      if (box.width === 0 || box.height === 0 || style.visibility === "hidden") continue;
      if (control.closest("[aria-hidden=true], nextjs-portal")) continue;
      // WCAG 2.5.5's inline exception: a link inside running text.
      if (control.tagName === "A" && control.closest("p")) continue;
      // A control inside a label is pressed through its label.
      const label = control.closest("label");
      const hit = label ? label.getBoundingClientRect() : box;
      // A visually hidden control (sr-only) is no target of its own: its label is.
      if (!label && box.width <= 1 && box.height <= 1) continue;
      if (hit.width + 0.5 < 44 || hit.height + 0.5 < 44) {
        const name = (control.getAttribute("aria-label") ?? control.textContent ?? "").trim();
        small.push(
          `${control.tagName.toLowerCase()} "${name.slice(0, 40)}" ${Math.round(hit.width)}×${Math.round(hit.height)}`,
        );
      }
    }
    return small;
  });
}

/**
 * The Tab walk (decided item 7): from the top, Tab until focus comes back to the first element.
 * Every element reached shows a focus indicator; focus moves on every press; <main> is reached
 * within 40 presses. Focus that comes back to an element it already left, before the first, is a
 * trap (it circles without reaching the rest of the page). The outer stop is one press per
 * focusable element of the page and 100 more: a page can hold thousands (the Head's Analytics).
 */
async function tabWalk(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const focusable = await page.evaluate(
    () =>
      document.querySelectorAll(
        "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])",
      ).length,
  );
  const problems: string[] = [];
  let mainAt: number | null = null;
  let stops = 0;
  for (let press = 1; press <= focusable + 100; press += 1) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body || element.tagName === "NEXTJS-PORTAL") {
        return { kind: "outside" as const };
      }
      const first = element.hasAttribute("data-a11y-first");
      const same = element.hasAttribute("data-a11y-last");
      const again = !same && element.hasAttribute("data-a11y-seen");
      element.setAttribute("data-a11y-seen", "");
      for (const old of document.querySelectorAll("[data-a11y-last]")) {
        old.removeAttribute("data-a11y-last");
      }
      element.setAttribute("data-a11y-last", "");
      if (!document.querySelector("[data-a11y-first]")) element.setAttribute("data-a11y-first", "");
      const shows = (node: Element) => {
        const style = getComputedStyle(node);
        return (
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none"
        );
      };
      let indicator = false;
      let node: Element | null = element;
      for (let up = 0; node && up < 3 && !indicator; up += 1, node = node.parentElement) {
        indicator = shows(node);
      }
      const name = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
      // A date field takes one Tab per part (day, month, year, the picker): the same element,
      // which is no trap.
      const parts =
        element instanceof HTMLInputElement &&
        /^(date|month|time|datetime-local)$/.test(element.type);
      if (same && parts) return { kind: "outside" as const };
      return {
        kind: "element" as const,
        first,
        same,
        again,
        inMain: element.closest("main") !== null,
        visible: element.matches(":focus-visible") && indicator,
        name: `${element.tagName.toLowerCase()} "${name.slice(0, 40)}"`,
      };
    });
    if (at.kind === "outside") continue;
    if (at.first && stops > 0) {
      expect(problems, "Tab walk").toEqual([]);
      expect(mainAt, "Tab reaches <main> within 40 presses").not.toBeNull();
      expect(mainAt!).toBeLessThanOrEqual(40);
      return;
    }
    stops += 1;
    if (at.again) throw new Error(`Tab came back to ${at.name} before the first element: a trap`);
    if (at.same) problems.push(`focus stays on ${at.name}`);
    if (!at.visible) problems.push(`no focus indicator on ${at.name}`);
    if (at.inMain && mainAt === null) mainAt = press;
  }
  throw new Error(`Tab never came back to the first element in ${focusable + 100} presses`);
}

/** The ids of the shared list, from this run's records. */
function idsOf(w: World): ScreenIds {
  return {
    branch: w.scene.branch.id,
    department: w.scene.department,
    manager: w.scene.manager.id,
    unit: w.unit,
    product: w.product,
    subtype: w.subtype,
    suggestion: w.suggestion,
    document: w.document,
    draft: w.draft.id,
    waiting: w.waiting.id,
    open: w.open.id,
    settling: w.settling.id,
    settlingVariant: w.settling.variantId,
  };
}

for (const screen of SCREENS) {
  const title = `${screen.route}${screen.note ? ` (${screen.note})` : ""} as ${screen.who ?? "nobody signed in"}: no serious axe finding in both themes, 44 px targets, the Tab walk (9.1d; 11 rule 13)`;
  test(title, async ({ browser, world }, info) => {
    test.setTimeout(300_000);
    const viewport = info.project.use.viewport!;
    const phone = viewport.width < 640;
    const url = screen.url(idsOf(world));
    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({
        viewport,
        baseURL: info.project.use.baseURL,
        colorScheme: theme,
        ...(screen.who ? { storageState: world.states[screen.who] } : {}),
      });
      try {
        const page = await context.newPage();
        await open(page, url);
        // The dark pass is dark: no kept light choice, and the canvas is the dark one (review
        // correction 2).
        const kept = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
        expect(kept === null || kept === theme).toBe(true);
        if (theme === "dark") expect(await canvas(page)).toBe(DARK_CANVAS);
        await axe(page, `${url} ${theme}`);
        if (theme === "light") {
          if (phone) expect(await smallTargets(page), "targets under 44 × 44").toEqual([]);
          await tabWalk(page);
        }
      } finally {
        await context.close();
      }
    }
  });
}
