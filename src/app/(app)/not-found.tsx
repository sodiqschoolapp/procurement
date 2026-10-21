import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";

// "Not found" for every notFound() of a signed-in page: another branch's order, user or branch
// (03-roles-and-permissions.md rule 1; 15-quality-and-acceptance.md S7; plan of 2.15, decided
// item 4, Look first), and for a mistyped address (the catch-all page `[...missing]`). The
// design system's empty state with a way back to the orders (docs/design-system.md, Parts). It shows
// nothing of the record asked for.
export default async function NotFound() {
  const t = await getTranslations();
  return (
    <EmptyState
      icon="search"
      title={t("notFoundPage.title")}
      line={t("errors.notFound")}
      action={{ label: t("notFoundPage.back"), href: "/orders" }}
      className="py-16 sm:py-24"
    />
  );
}
