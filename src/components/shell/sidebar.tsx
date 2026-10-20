"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Icon } from "@/components/icon";
import { applySidebar, subscribeToRoot } from "@/components/theme";
import { cn } from "@/components/utils";
import type { Role } from "@/domain/permissions";

import { isActive, menuFor } from "./menu";
import { Avatar } from "./person";
import { SignOutButton } from "./sign-out-button";

// The menu from 640 px on (docs/design-system.md, Page shell): white with a hairline edge (dark:
// --sidebar), 240 wide, the colour logo at the top (on-dark in the dark theme), the role's items
// (icon and word, 36 high, corner 6). The active item has a light navy tint, navy text, its icon
// filled and a small orange marker at its left edge. At the bottom the person with a sign-out
// icon button. It collapses to the 64-wide rail with the shield; the choice is kept in the
// browser and applied before the first paint (plan of 0.10b, decision 12), so the rail is drawn
// by CSS (`rail:`).

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring";
const QUIET =
  "transition-colors duration-120 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function Sidebar({
  role,
  fullName,
  schoolName,
}: {
  role: Role;
  fullName: string;
  /** The school name of the settings, or `null` until set (plan of 1.1, decision 13). */
  schoolName: string | null;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  // Read from <html> in the browser; the server cannot know the browser's choice.
  const rail = useSyncExternalStore(
    subscribeToRoot,
    () => document.documentElement.dataset.sidebar === "rail",
    () => false,
  );

  const toggle = () => applySidebar(rail ? "full" : "rail");
  const toggleLabel = t(rail ? "shell.expand" : "shell.collapse");

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground sm:flex rail:w-16">
      <div className="flex h-14 shrink-0 items-center px-5 rail:justify-center rail:px-0">
        <Image
          src="/brand/sodiq-logo-horizontal.svg"
          alt={t("login.logo")}
          width={150}
          height={24}
          unoptimized
          priority
          className="h-6 w-auto dark:hidden rail:hidden"
        />
        <Image
          src="/brand/sodiq-logo-horizontal-on-dark.svg"
          alt={t("login.logo")}
          width={150}
          height={24}
          unoptimized
          priority
          className="hidden h-6 w-auto dark:block rail:hidden dark:rail:hidden"
        />
        <Image
          src="/brand/sodiq-mark.svg"
          alt={t("login.logo")}
          width={22}
          height={28}
          unoptimized
          className="hidden h-7 w-auto rail:block dark:rail:hidden"
        />
        <Image
          src="/brand/sodiq-mark-on-dark.svg"
          alt={t("login.logo")}
          width={22}
          height={28}
          unoptimized
          className="hidden h-7 w-auto dark:rail:block"
        />
      </div>
      {schoolName && (
        <p
          title={schoolName}
          className="-mt-1 truncate px-5 pb-2 text-xs text-muted-foreground rail:hidden"
        >
          {schoolName}
        </p>
      )}
      <nav aria-label={t("shell.menuLabel")} className="flex-1 overflow-y-auto px-3 py-3 rail:px-2">
        <ul className="flex flex-col gap-0.5">
          {menuFor(role).map((item) => {
            const active = isActive(item, pathname);
            const label = t(`shell.menu.${item.id}`);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-label={label}
                  title={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium rail:justify-center rail:px-0",
                    FOCUS,
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand"
                      : QUIET,
                  )}
                >
                  <Icon name={item.icon} filled={active} />
                  <span className="truncate rail:sr-only">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex shrink-0 flex-col gap-1 border-t border-sidebar-border p-3 rail:px-2">
        <div className="flex items-center gap-1 rail:flex-col">
          <Link
            href="/profile"
            title={t("shell.profile")}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 rail:flex-none",
              FOCUS,
              QUIET,
            )}
          >
            <Avatar fullName={fullName} className="size-8" />
            <span className="flex min-w-0 flex-col rail:sr-only">
              <span className="truncate text-sm font-medium text-foreground">{fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{t(`roles.${role}`)}</span>
            </span>
          </Link>
          <SignOutButton
            kind="icon"
            className={cn("flex size-9 items-center justify-center rounded-md", FOCUS, QUIET)}
          />
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          aria-expanded={!rail}
          title={toggleLabel}
          className={cn(
            "flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground rail:justify-center rail:px-0",
            FOCUS,
            QUIET,
          )}
        >
          <Icon name={rail ? "chevron_right" : "chevron_left"} size={18} />
          <span className="rail:sr-only" aria-hidden="true">
            {toggleLabel}
          </span>
        </button>
      </div>
    </aside>
  );
}
