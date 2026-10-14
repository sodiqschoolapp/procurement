import * as z from "zod";

import { type CompanyKind, isCompanyKind, isNote, isTaxId } from "@/domain/catalogs";
import { isPhone, phone } from "@/domain/users";
import { companies } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField, optionalText } from "./catalog-fields";

// Companies and brands (04-catalogs.md, Catalogs table: "Name, kind (brand, supplier or both), tax
// ID, phone, note"; "One list serves both the brand on a request and the supplier on a purchase").
// Table `companies`, audit `company.*`. The kind has no preset and can be changed (plan of 1.5,
// decision 6). Tax ID, phone and note are optional; the tax ID is 9 or 14 digits, the phone the
// users' rule (decision 5; developer-rules.md rule 1).

export type CompanyFields = {
  name: string;
  kind: CompanyKind;
  taxId: string | null;
  phone: string | null;
  note: string | null;
};

const trim = (value: string) => value.trim();

const catalog = defineCatalogActions<CompanyFields>({
  kind: "companies",
  name: "Company",
  table: companies,
  prefix: "company",
  columns: {
    name: companies.name,
    kind: companies.kind,
    taxId: companies.taxId,
    phone: companies.phone,
    note: companies.note,
  },
  shape: {
    name: nameField,
    // A refine, not z.enum: an unchosen kind then reads "Fill in this field", not "not allowed".
    kind: z
      .string()
      .refine(isCompanyKind)
      .transform((value) => value as CompanyKind),
    taxId: optionalText(trim, isTaxId),
    phone: optionalText(phone, isPhone),
    note: optionalText(trim, isNote),
  },
  unique: ["name"],
});

export const createCompany = catalog.create;
export const updateCompany = catalog.update;
export const setCompanyActive = catalog.setActive;
