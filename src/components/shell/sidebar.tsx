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

// The menu from 640 px on (docs/design-system.md, Layout shell): navy in both themes, 240 wide,
// the on-dark one-line logo, the role's items (icon and word, 40 high, corner 8, the active one
// solid orange with navy text), and at the bottom the person with a sign-out icon button. It
// collapses to the 72-wide rail with the shield; the choice is kept in the browser and applied
// before the first paint (plan of 0.10b, decision 12), so the rail is drawn by CSS (`rail:`).

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
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground sm:flex rail:w-[72px]">
      <div className="flex h-16 shrink-0 items-center px-5 rail:justify-center rail:px-0">
        <Image
          src="/brand/sodiq-logo-horizontal-on-dark.svg"
          alt={t("login.logo")}
          width={163}
          height={26}
          unoptimized
          priority
          className="h-[26px] w-auto rail:hidden"
        />
        <Image
          src="/brand/sodiq-mark-on-dark.svg"
          alt={t("login.logo")}
          width={25}
          height={32}
          unoptimized
          className="hidden h-8 w-auto rail:block"
        />
      </div>
      {schoolName && (
        <p
          title={schoolName}
          className="-mt-2 truncate px-5 pb-2 text-[13px] leading-5 text-sidebar-foreground/70 rail:hidden"
        >
          {schoolName}
        </p>
      )}
      <nav aria-label={t("shell.menuLabel")} className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
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
                    "flex h-10 items-center gap-3 rounded-lg px-3 text-sm leading-5 rail:justify-center rail:px-0",
                    FOCUS,
                    active ? "bg-sidebar-primary text-sidebar-primary-foreground" : QUIET,
                  )}
                >
                  <Icon name={item.icon} />
                  <span className="truncate rail:sr-only">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          aria-expanded={!rail}
          title={toggleLabel}
          className={cn(
            "flex size-10 items-center justify-center self-end rounded-lg rail:self-center",
            FOCUS,
            QUIET,
          )}
        >
          <Icon name={rail ? "chevron_right" : "chevron_left"} />
        </button>
        <div className="flex items-center gap-1 rail:flex-col">
          <Link
            href="/profile"
            aria-label={t("shell.profile")}
            title={t("shell.profile")}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 rail:flex-none",
              FOCUS,
              QUIET,
            )}
          >
            <Avatar fullName={fullName} />
            <span className="flex min-w-0 flex-col rail:hidden">
              <span className="truncate text-sm leading-5 font-semibold text-sidebar-accent-foreground">
                {fullName}
              </span>
              <span className="truncate text-xs leading-4">{t(`roles.${role}`)}</span>
            </span>
          </Link>
          <SignOutButton
            kind="icon"
            className={cn("flex size-10 items-center justify-center rounded-lg", FOCUS, QUIET)}
          />
        </div>
      </div>
    </aside>
  );
}
