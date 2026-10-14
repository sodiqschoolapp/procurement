import { categories } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField } from "./catalog-fields";

// Categories (04-catalogs.md, Catalogs table: "Name"; "Stationery, cleaning, food, furniture, IT
// and so on"). Table `categories`, audit `category.*`.

export type CategoryFields = { name: string };

const catalog = defineCatalogActions<CategoryFields>({
  kind: "categories",
  name: "Category",
  table: categories,
  prefix: "category",
  columns: { name: categories.name },
  shape: { name: nameField },
  unique: ["name"],
});

export const createCategory = catalog.create;
export const updateCategory = catalog.update;
export const setCategoryActive = catalog.setActive;
