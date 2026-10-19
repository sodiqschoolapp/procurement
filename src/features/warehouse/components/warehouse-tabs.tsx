import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { seesStockCounts } from "@/components/shell/menu";
import { cn } from "@/components/utils";
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
    <nav aria-label={t("label")} className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={cn(
            "-mb-px flex h-11 items-center border-b-2 px-4 text-[15px] leading-[22px] font-semibold",
            tab.id === current
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab.id)}
        </Link>
      ))}
    </nav>
  );
}
