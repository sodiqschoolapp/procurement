import { type Locator, type Page, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  as,
  expect,
  insertDraft,
  newDepartment,
  newProduct,
  newScene,
  scrollsSideways,
  stockIn,
  tag,
  withDatabase,
} from "./acceptance-fixtures";

// 15-quality-and-acceptance.md S22, "A Manager adds what is missing", at 375 px and 1440 px
// (04-catalogs.md rule 8; 05 field 2; 11 rule 2; 10 Home page per role: Head; 03 Manager rights:
// ADD_PRODUCTS; build-plan 1.12b). Each run has its own branch, Manager and Head (newScene), so
// switching the Manager's right off touches no other test (plan of 1.12b, decided item 14).

const t = en.orders;
const a = en.orders.addEntry;

/** A category and a measure of their own, active, for the add's selects. */
async function stationery(mark: string): Promise<{ category: string; unit: string }> {
  const category = `Stationery ${mark}`;
  const unit = `pcs ${mark}`;
  await withDatabase(async (client) => {
    await client.query(
      `insert into categories (name, is_active, created_at) values ($1, true, now())`,
      [category],
    );
    await client.query(
      `insert into units (name, short_name, allow_decimal, is_active, created_at)
       values ($1, $2, false, true, now())`,
      [unit, `p${mark}`],
    );
  });
  return { category, unit };
}

function picker(page: Page) {
  return page.getByRole("form", { name: t.add.title }).getByRole("combobox", {
    name: t.columns.product,
  });
}

/** Types into the add form's product search until the search has answered for the text. */
async function search(page: Page, text: string, shows: Locator) {
  await expect(async () => {
    await picker(page).fill(text);
    await expect(shows).toBeVisible({ timeout: 2000 });
  }).toPass();
}

/** The search's last line "Add …" for the text typed; an accessible name folds its spaces. */
function addLine(page: Page, text: string) {
  const name = t.picker.add
    .replace("{name}", text)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[“”]/g, ".")
    .replace(/\s+/g, "\\s+");
  return page.getByRole("option", { name: new RegExp(name) });
}

test("S22: the marker added, the existing notebook offered, the first subtype of Pen, the Head's list, the right off", async ({
  page,
}) => {
  test.slow();
  const scene = await newScene();
  const mark = tag();
  const { category, unit } = await stationery(mark);
  const marker = `Marker, black ${mark}`;
  const notebook = `Daftar 48 varaq ${mark}`;
  const pen = `Pen ${mark}`;
  await newProduct(notebook, 3000);
  const penDefault = await newProduct(pen, 2500);
  await stockIn(scene.branch.id, penDefault, 40, 2000, scene.head);
  const second = await newDepartment(scene.branch.id, `Ikkinchi ${mark}`);
  await insertDraft(scene.manager, scene.branch.id, penDefault, scene.department, 5, 2500);
  await insertDraft(scene.manager, scene.branch.id, penDefault, second, 3, 2500);

  await as(page, scene.manager);
  await page.goto("/orders");

  // "Marker, black", not in the catalog: the search's last line adds it.
  await search(page, marker, addLine(page, marker));
  await addLine(page, marker).click();
  const dialog = page.getByRole("dialog", { name: a.title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(a.productName)).toHaveValue(marker);
  await dialog.getByLabel(en.catalog.fields.categoryId).selectOption({ label: category });
  await dialog.getByLabel(en.catalog.fields.unitId).selectOption({ label: unit });
  expect(await scrollsSideways(page)).toBe(false);
  await dialog.getByRole("button", { name: a.save, exact: true }).click();
  await expect(dialog).toBeHidden();
  // On the draft at once, with no price suggested and no price hint.
  await expect(picker(page)).toHaveValue(marker);
  const form = page.getByRole("form", { name: t.add.title });
  await form.getByLabel(t.columns.requestedBy).selectOption({ index: 1 });
  await form.getByLabel(t.columns.quantity).fill("6");
  await form.getByRole("button", { name: t.add.button, exact: true }).click();
  await expect
    .poll(() =>
      withDatabase(
        async (client) =>
          (
            await client.query<{ price: string | null }>(
              `select o.planned_price::text as price from orders o
                 join product_variants v on v.id = o.variant_id
                 join products p on p.id = v.product_id
                where p.name = $1 and o.owner_id = $2`,
              [marker, scene.manager.id],
            )
          ).rows,
      ),
    )
    .toEqual([{ price: null }]);
  // No price hint: it needs a catalog price to compare with (05 Ticking and filters: Price hint).
  await expect(page.getByText(/vs catalog price/)).toHaveCount(0);

  // "daftar  48 VARAQ" while "Daftar 48 varaq" exists: the existing one is offered, none made.
  const typedNotebook = `daftar  48 VARAQ ${mark.toUpperCase()}`;
  await search(page, typedNotebook, addLine(page, typedNotebook));
  await addLine(page, typedNotebook).click();
  await dialog.getByLabel(en.catalog.fields.categoryId).selectOption({ label: category });
  await dialog.getByLabel(en.catalog.fields.unitId).selectOption({ label: unit });
  await dialog.getByRole("button", { name: a.save, exact: true }).click();
  await expect(dialog.getByText(a.exists.replace("{name}", notebook))).toBeVisible();
  await dialog.getByRole("button", { name: a.useIt }).click();
  await expect(dialog).toBeHidden();
  await expect(picker(page)).toHaveValue(notebook);
  const notebooks = await withDatabase(
    async (client) =>
      (
        await client.query<{ n: number }>(
          `select count(*)::int as n from products
            where lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) = lower($1)`,
          [notebook],
        )
      ).rows[0]!.n,
  );
  expect(notebooks).toBe(1);

  // "black" added to "Pen", which had no subtypes and 40 in stock, the existing ones "blue".
  const typedPen = `Pen black ${mark}`;
  await search(page, typedPen, addLine(page, typedPen));
  await addLine(page, typedPen).click();
  await dialog.getByRole("radio", { name: a.newSubtype }).click();
  await dialog.getByLabel(a.ofProduct).fill(pen);
  await dialog.getByRole("button", { name: pen, exact: true }).click();
  await dialog.getByLabel(a.subtypeName).fill("black");
  await dialog.getByLabel(a.existingName).fill("blue");
  expect(await scrollsSideways(page)).toBe(false);
  await dialog.getByRole("button", { name: a.save, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(picker(page)).toHaveValue(`${pen} — black`);
  // The earlier pen orders and the 40 in stock now read "Pen · blue".
  await page.reload();
  await expect(page.getByText(`${pen} — blue`).first()).toBeAttached();
  const blue = await withDatabase(
    async (client) =>
      (
        await client.query<{ name: string; is_default: boolean; qty: string }>(
          `select v.name, v.is_default, b.qty::text as qty
             from product_variants v join stock_balances b on b.variant_id = v.id
            where v.id = $1 and b.branch_id = $2`,
          [penDefault, scene.branch.id],
        )
      ).rows[0],
  );
  expect(blue).toEqual({ name: "blue", is_default: false, qty: "40.000" });

  // The Head's home lists the marker and "black" until the Head marks them checked.
  await as(page, scene.head);
  await page.goto("/");
  const block = page.locator("section", {
    has: page.getByRole("heading", { name: en.home.head.added.title }),
  });
  await expect(block.getByText(marker)).toBeVisible();
  const black = `${pen} · black`;
  await expect(block.getByText(black)).toBeVisible();
  await block.getByRole("checkbox", { name: `Tick ${marker}` }).check();
  await block.getByRole("checkbox", { name: `Tick ${black}` }).check();
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole("button", { name: en.home.head.added.mark }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Mark 2 entries checked?");
  await confirm.getByRole("button", { name: en.home.head.added.mark }).click();
  await expect(page.getByText(marker)).toBeHidden();

  // The Head switches the right off: the search offers no Add line, and the server refuses it.
  await page.goto(`/users/${scene.manager.id}`);
  const right = page.getByRole("checkbox", {
    name: new RegExp(en.managerRights.names.ADD_PRODUCTS),
  });
  await expect(right).toBeChecked();
  await expect(right).toBeEnabled();
  await right.uncheck();
  await expect(right).not.toBeChecked();
  await expect
    .poll(() =>
      withDatabase(
        async (client) =>
          (
            await client.query<{ enabled: boolean }>(
              `select enabled from manager_rights where user_id = $1 and "right" = 'ADD_PRODUCTS'`,
              [scene.manager.id],
            )
          ).rows[0]?.enabled,
      ),
    )
    .toBe(false);
  await as(page, scene.manager);
  await page.goto("/orders");
  const missing = `Marker, red ${mark}`;
  await search(page, missing, page.getByText(t.picker.empty));
  await expect(page.locator("[data-add-line]")).toHaveCount(0);
});
