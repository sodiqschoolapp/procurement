"use client";

import { Menu } from "@base-ui/react/menu";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icon";
import { cn } from "@/components/utils";
import type { Role } from "@/domain/permissions";

import { type MenuItem, isActive, menuFor, tabBarSplit } from "./menu";

// The menu below 640 px (docs/design-system.md, Layout shell: "a bottom tab bar (navy, the app's
// main items with icon and word, the active one orange)"; This app: "a role with more than five
// items shows the first four and 'More'"). Every target is at least 44 px (11 rule 13). "More"
// is a Base UI menu above the bar; its items are links (plan of 0.10b, decision 15).

const TAB =
  "flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0 text-[11px] leading-4 tracking-tight font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring";

function tabClass(active: boolean): string {
  return cn(
    TAB,
    active
      ? "bg-sidebar-primary text-sidebar-primary-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
      className="fixed inset-x-0 bottom-0 z-20 bg-sidebar px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:hidden"
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
                <Icon name={item.icon} size={24} />
                <span className="line-clamp-2 max-w-full text-center">{label(item)}</span>
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li className="flex min-w-0 flex-1">
            <Menu.Root>
              <Menu.Trigger className={tabClass(moreActive)}>
                <Icon name="more_horiz" size={24} />
                <span className="line-clamp-2 max-w-full text-center">{t("shell.menu.more")}</span>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="top" align="end" sideOffset={8} className="z-30">
                  <Menu.Popup className="min-w-48 rounded-lg bg-popover p-1 text-popover-foreground shadow-[0_8px_24px_-8px_rgb(6_17_60/0.2)] outline-none">
                    {more.map((item) => {
                      const active = isActive(item, pathname);
                      return (
                        <Menu.LinkItem
                          key={item.id}
                          render={<Link href={item.href} />}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm font-semibold outline-none data-highlighted:bg-accent",
                            active &&
                              "bg-primary text-primary-foreground data-highlighted:bg-primary-hover",
                          )}
                        >
                          <Icon name={item.icon} size={24} />
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
