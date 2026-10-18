import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { cn } from "@/components/utils";

// Stock on hand | Documents above both warehouse lists (11-screens-and-ux.md, Screens: both for
// All; plan of 5.12, decided item 11): the one Warehouse (or Stock) menu item leads to Stock on
// hand, and these tabs lead from one list to the other.

export async function WarehouseTabs({ current }: { current: "stock" | "documents" }) {
  const t = await getTranslations("warehouse.documents.tabs");
  const tabs = [
    { id: "stock", href: "/warehouse/stock" },
    { id: "documents", href: "/warehouse/documents" },
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
