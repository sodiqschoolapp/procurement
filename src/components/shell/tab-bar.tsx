"use client";

import { Menu } from "@base-ui/react/menu";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icon";
import { cn } from "@/components/utils";
import type { Role } from "@/domain/permissions";

import { type MenuItem, isActive, menuFor, tabBarSplit } from "./menu";

// The menu below 640 px (docs/design-system.md, Page shell: "Phone tab bar": white with a
// hairline top edge, icon above word; the active tab navy, its icon filled and the orange marker
// above it; "the first four and 'More' when there are more than five"). Every target is at least
// 44 px (11 rule 13). "More" is a Base UI menu above the bar; its items are links (plan of 0.10b,
// decision 15).

const TAB =
  "relative flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-0 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring";

function tabClass(active: boolean): string {
  return cn(
    TAB,
    active
      ? "text-sidebar-primary-foreground before:absolute before:top-0 before:left-1/2 before:h-[3px] before:w-6 before:-translate-x-1/2 before:rounded-b-full before:bg-brand"
      : "text-muted-foreground hover:text-foreground",
  );
}

export function TabBar({ role }: { role: Role }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { shown, more } = tabBarSplit(menuFor(role));
  const label = (item: MenuItem) => t(`shell.menu.${item.id}`);
  const moreActive = more.some((item) => isActive(item, pathname));

  return (
    <nav
      aria-label={t("shell.menuLabel")}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-sidebar-border bg-sidebar/95 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
    >
      <ul className="flex gap-0.5">
        {shown.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.id} className="flex min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <Icon name={item.icon} size={24} filled={active} />
                <span className="line-clamp-2 max-w-full text-center">{label(item)}</span>
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li className="flex min-w-0 flex-1">
            <Menu.Root>
              <Menu.Trigger className={tabClass(moreActive)}>
                <Icon name="more_horiz" size={24} filled={moreActive} />
                <span className="line-clamp-2 max-w-full text-center">{t("shell.menu.more")}</span>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="top" align="end" sideOffset={8} className="z-30">
                  <Menu.Popup className="min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-float outline-none">
                    {more.map((item) => {
                      const active = isActive(item, pathname);
                      return (
                        <Menu.LinkItem
                          key={item.id}
                          render={<Link href={item.href} />}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none data-highlighted:bg-accent",
                            active && "bg-sidebar-primary text-sidebar-primary-foreground",
                          )}
                        >
                          <Icon name={item.icon} size={24} filled={active} />
                          {label(item)}
                        </Menu.LinkItem>
                      );
                    })}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </li>
        )}
      </ul>
    </nav>
  );
}
