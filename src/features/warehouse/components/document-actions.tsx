"use client";

import { Menu } from "@base-ui/react/menu";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";

// The new-document buttons of Stock on hand and the documents list (new-document-buttons.tsx
// decides which the user may make; the form asks again). From 640 px each is its own button, as
// before. On a phone the first stands alone and the others open from "More" (redesign of
// 22.10.2026: four buttons took the first 170 px of the screen); with two or fewer there is no
// menu.

export type DocumentAction = { type: string; href: string; label: string; icon: IconName };

export function DocumentActions({ actions }: { actions: readonly DocumentAction[] }) {
  const t = useTranslations("shell.menu");
  const folded = actions.length > 2;
  const [first, ...rest] = actions;
  if (!first) return null;
  return (
    <>
      {actions.map((action, index) => (
        <Link
          key={action.type}
          href={action.href}
          data-document-action={action.type}
          className={cn(
            buttonVariants({ variant: index === 0 ? "default" : "secondary" }),
            "max-sm:h-12",
            folded && index > 0 && "max-sm:hidden",
          )}
        >
          <Icon name={action.icon} />
          {action.label}
        </Link>
      ))}
      {folded && (
        <Menu.Root>
          <Menu.Trigger
            data-document-more
            className={cn(buttonVariants({ variant: "secondary" }), "h-12 sm:hidden")}
          >
            <Icon name="more_horiz" />
            {t("more")}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-30">
              <Menu.Popup className="min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-float outline-none">
                {rest.map((action) => (
                  <Menu.LinkItem
                    key={action.type}
                    render={<Link href={action.href} />}
                    className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none data-highlighted:bg-accent"
                  >
                    <Icon name={action.icon} />
                    {action.label}
                  </Menu.LinkItem>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
    </>
  );
}
