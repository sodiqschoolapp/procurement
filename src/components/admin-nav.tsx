import { getTranslations } from "next-intl/server";
import { TabLinks } from "@/components/tab-links";

// Moving between the Admin pages (11-screens-and-ux.md, Interface per role: "Admin groups
// catalogs, prices, users, branches and settings"; plan of 1.2, decision 12): the tabs of
// docs/design-system.md (Parts, "Tabs"), each a link to a page, in the spec's order. At phone width
// the row scrolls sideways inside itself, so the page itself never scrolls sideways.

export type AdminPage = "catalog" | "prices" | "users" | "branches" | "settings";

const PAGES: readonly { id: AdminPage; href: string }[] = [
  { id: "catalog", href: "/catalog" },
  { id: "prices", href: "/prices" },
  { id: "users", href: "/users" },
  { id: "branches", href: "/branches" },
  { id: "settings", href: "/settings" },
];

export async function AdminNav({ current }: { current: AdminPage }) {
  const t = await getTranslations("admin");
  return (
    <TabLinks
      label={t("label")}
      tabs={PAGES.map((page) => ({
        id: page.id,
        href: page.href,
        label: t(page.id),
        current: page.id === current,
      }))}
    />
  );
}
