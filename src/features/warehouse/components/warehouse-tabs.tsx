import { getTranslations } from "next-intl/server";

import { seesStockCounts } from "@/components/shell/menu";
import { TabLinks } from "@/components/tab-links";
import type { Role } from "@/domain/permissions";

// Stock on hand | Documents above both warehouse lists (11-screens-and-ux.md, Screens: both for
// All; plan of 5.12, decided item 11): the one Warehouse (or Stock) menu item leads to Stock on
// hand, and these tabs lead from one list to the other. Counts is a third tab for the roles that
// open it (11 Screens: "Stock counts | Manager, Head"; plan of 7.3).

export async function WarehouseTabs({
  current,
  role,
}: {
  current: "stock" | "documents" | "counts";
  role: Role;
}) {
  const t = await getTranslations("warehouse.documents.tabs");
  const tabs = [
    { id: "stock", href: "/warehouse/stock" },
    { id: "documents", href: "/warehouse/documents" },
    ...(seesStockCounts(role) ? [{ id: "counts", href: "/warehouse/counts" } as const] : []),
  ] as const;
  return (
    <TabLinks
      label={t("label")}
      tabs={tabs.map((tab) => ({
        id: tab.id,
        href: tab.href,
        label: t(tab.id),
        current: tab.id === current,
      }))}
    />
  );
}
