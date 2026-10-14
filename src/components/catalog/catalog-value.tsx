"use client";

import { useTranslations } from "next-intl";

import type { CatalogFieldType } from "@/domain/catalogs";

// One value of a catalog entry in a list (build-plan 1.5: the shared catalog component): a yes/no
// box as a word, the company kind by its name, an empty optional field as nothing.

export function CatalogValue({
  type,
  value,
}: {
  type: CatalogFieldType;
  value: string | boolean | null;
}) {
  const t = useTranslations("catalog");
  if (value === null || value === "") return null;
  if (type === "boolean") return <>{value ? t("yes") : t("no")}</>;
  if (type === "companyKind" && typeof value === "string") {
    return <>{t(`companyKind.${value as "BRAND" | "SUPPLIER" | "BOTH"}`)}</>;
  }
  return <>{String(value)}</>;
}
