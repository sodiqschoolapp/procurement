import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };

// docs/design-system.md on the sign-in page (build-plan 0.10a, Done when; the app's own look of
// 21.10.2026, D60, which drops Bitter): Type (Golos Text only; every letter of "Oʻgʻil,
// Ўзбекистон, Қашқадарё, Ғулом, Ҳамид" from the app's own font files, U+02BB included, at the
// weights in use); This app, Sign-in (the brand panel hidden at phone width); Colour (the theme
// follows the device; the choice is kept in the browser); Buttons and Accessibility (44 px touch
// targets at phone width); Motion (none for people who ask for reduced motion; review correction
// 4). 11-screens-and-ux.md rules 13 and 15. Both widths are the projects of playwright.config.ts.

const SAMPLE = "Oʻgʻil, Ўзбекистон, Қашқадарё, Ғулом, Ҳамид";

// The page colour, --background, of each theme (docs/design-system.md, Colour).
const LIGHT_CANVAS = "#F5F6F8";
const DARK_CANVAS = "#0A0F1E";

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 640;
}

async function canvasOf(page: Page): Promise<string> {
  // The body's background as the browser paints it, read back as a pixel in sRGB hex.
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
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

for (const weight of [400, 500, 600] as const) {
  test(`Golos Text draws every letter of the Uzbek and Cyrillic sample at ${weight} (design system, Type)`, async ({
    page,
  }) => {
    await page.goto("/login");
    await page.evaluate(
      async ({ text, weight: shown }) => {
        const probe = document.createElement("p");
        probe.id = "golos-probe";
        probe.style.fontWeight = String(shown);
        probe.textContent = text;
        document.body.append(probe);
        await document.fonts.load(`${shown} 16px "Golos Text Variable"`, text);
        await document.fonts.load(`${shown} 16px "Golos Text Uzbek"`, text);
        await document.fonts.ready;
      },
      { text: SAMPLE, weight },
    );

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "#golos-probe",
    });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });

    // Every glyph of the sample comes from the app's own files, none from a system fallback:
    // Golos Text, and for U+02BB the "Golos Text Uzbek" face of the PDF fonts globals.css adds.
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font, JSON.stringify(fonts)).toMatchObject({ isCustomFont: true });
      expect(font.familyName).toMatch(/^Golos/);
    }
  });
}

test("the title, the fields and the button are set in Golos Text (design system, Type)", async ({
  page,
}) => {
  await page.goto("/login");
  const title = page.getByRole("heading", { level: 1, name: uz.login.title });
  await expect(title).toHaveCSS("font-family", /^"Golos Text Variable"/);
  await expect(page.getByLabel(uz.login.username)).toHaveCSS(
    "font-family",
    /^"Golos Text Variable"/,
  );
  await expect(page.getByRole("button", { name: uz.login.submit })).toHaveCSS(
    "font-family",
    /^"Golos Text Variable"/,
  );
});

test("the brand panel shows on a desktop and is hidden at phone width (design system, This app, Sign-in)", async ({
  page,
}) => {
  await page.goto("/login");
  const panel = page.getByTestId("brand-panel");
  if (isPhone(page)) {
    await expect(panel).toBeHidden();
  } else {
    await expect(panel).toBeVisible();
    await expect(panel.getByText(uz.login.slogan)).toHaveCSS("text-transform", "uppercase");
    await expect(panel.getByText(uz.login.slogan)).toHaveCSS(
      "font-family",
      /^"Golos Text Variable"/,
    );
  }
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
});

for (const scheme of ["light", "dark"] as const) {
  test(`with the device set to ${scheme}, the page follows it (design system, Colour; rule 15)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/login");
    expect(await canvasOf(page)).toBe(scheme === "dark" ? DARK_CANVAS : LIGHT_CANVAS);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  });
}

test("the theme button's choice is kept after a reload and the device no longer decides", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  const button = page.getByRole("button", { name: uz.theme.dark });
  await expect(button).toHaveAttribute("aria-pressed", "false");

  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await canvasOf(page)).toBe(DARK_CANVAS);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await canvasOf(page)).toBe(DARK_CANVAS);
  await expect(page.getByRole("button", { name: uz.theme.dark })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The other way: a light choice wins over a dark device.
  await page.getByRole("button", { name: uz.theme.dark }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await canvasOf(page)).toBe(LIGHT_CANVAS);
});

test("every control a finger uses is at least 44 high at phone width (design system, Buttons)", async ({
  page,
}) => {
  test.skip(!isPhone(page), "The 44 px rule is for phone width; the desktop project skips it.");
  await page.goto("/login");
  const controls = page.locator("main button, main input, main select");
  const count = await controls.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i += 1) {
    const box = await controls.nth(i).boundingBox();
    expect(
      box?.height ?? 0,
      await controls.nth(i).evaluate((el) => el.outerHTML.slice(0, 80)),
    ).toBeGreaterThanOrEqual(44);
  }
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`the pending sign-in button's icon ${reducedMotion === "reduce" ? "does not turn when reduced motion is asked" : "turns otherwise"} (design system, Motion)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    // Hold the sign-in request, so the button stays pending while it is checked.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/login*", async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });

    await page.goto("/login");
    // An unknown, invented username per run, so the limit of 5 tries never locks anyone.
    await page
      .getByLabel(uz.login.username)
      .fill(`e2e_nobody_${Math.random().toString(36).slice(2, 10)}`);
    await page.getByLabel(uz.login.password).fill("invented-password");
    const button = page.getByRole("button", { name: uz.login.submit });
    await button.click();
    await expect(button).toHaveAttribute("aria-busy", "true");

    const running = await button
      .locator("svg.animate-spin")
      .first()
      .evaluate((icon) => icon.getAnimations().filter((a) => a.playState === "running").length);
    expect(running).toBe(reducedMotion === "reduce" ? 0 : 1);
    // Let the request finish before the page closes.
    release();
    await expect(page.getByRole("alert").filter({ hasText: uz.login.errors.wrong })).toBeVisible();
  });
}
