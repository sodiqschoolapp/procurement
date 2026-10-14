"use server";

import { revalidatePath } from "next/cache";

import { type CatalogKind, isCatalogKind } from "@/domain/catalogs";
import * as categories from "@/features/catalog/actions/categories";
import * as companies from "@/features/catalog/actions/companies";
import * as extraCosts from "@/features/catalog/actions/extra-cost-types";
import * as measures from "@/features/catalog/actions/measures";
import { serverAction } from "@/server/action";
import { type ActionResult, failure } from "@/server/action-result";

// The actions of /catalog/<kind> (plan of 1.5, "Server actions and queries"). The browser sends
// the catalog's address segment with the fields; each catalog's own action then runs in the
// wrapper, under catalog.manage (03, "Manage catalogs …"). A success revalidates the catalog pages.

const ACTIONS = {
  measures: {
    create: serverAction(measures.createMeasure),
    update: serverAction(measures.updateMeasure),
    setActive: serverAction(measures.setMeasureActive),
  },
  categories: {
    create: serverAction(categories.createCategory),
    update: serverAction(categories.updateCategory),
    setActive: serverAction(categories.setCategoryActive),
  },
  "extra-costs": {
    create: serverAction(extraCosts.createExtraCostType),
    update: serverAction(extraCosts.updateExtraCostType),
    setActive: serverAction(extraCosts.setExtraCostTypeActive),
  },
  companies: {
    create: serverAction(companies.createCompany),
    update: serverAction(companies.updateCompany),
    setActive: serverAction(companies.setCompanyActive),
  },
} satisfies Record<CatalogKind, Record<"create" | "update" | "setActive", unknown>>;

type Step = "create" | "update" | "setActive";

async function run(step: Step, input: unknown): Promise<ActionResult<unknown>> {
  if (typeof input !== "object" || input === null) return failure("invalid_input");
  const { catalog, ...rest } = input as { catalog?: unknown };
  if (!isCatalogKind(catalog)) return failure("invalid_input");
  const result = await ACTIONS[catalog][step](rest);
  if (result.ok) revalidatePath("/catalog", "layout");
  return result;
}

/** Adds an entry; the same client key twice gives the first one (developer-rules.md rule 8). */
export async function createCatalogEntryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return (await run("create", input)) as ActionResult<{ id: string }>;
}

/** Saves the fields the Head changed. */
export async function updateCatalogEntryAction(
  input: unknown,
): Promise<ActionResult<{ changed: string[] }>> {
  return (await run("update", input)) as ActionResult<{ changed: string[] }>;
}

/** Deactivates or activates an entry (04 rule 2). */
export async function setCatalogEntryActiveAction(
  input: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  return (await run("setActive", input)) as ActionResult<{ id: string; isActive: boolean }>;
}
