"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
import type { Role } from "@/domain/permissions";
import type { Locale } from "@/i18n/locale";

import { LanguageChoice } from "./language-choice";
import { Avatar } from "./person";
import { SignOutButton } from "./sign-out-button";
import { ThemeChoice } from "./theme-choice";

// The profile as a panel that slides in from the left (owner, 21.10.2026: "it does not have much
// settings"): the person's name, username and role, the language (A2), the theme (rule 15) and
// sign-out, the same as /profile, which stays for a direct address. Opened from the person in the
// menu and from the avatar of the top bar on a phone; Escape, the backdrop or Close shuts it.

/** Who the panel is about: the signed-in person. */
export type PanelPerson = { fullName: string; username: string; role: Role; locale: Locale };

export function ProfilePanel({
  fullName,
  username,
  role,
  locale,
  triggerClassName,
  triggerLabel,
  triggerTitle,
  children,
}: PanelPerson & {
  triggerClassName?: string;
  /** The trigger's name when it shows no words of its own (the avatar of the top bar). */
  triggerLabel?: string;
  triggerTitle?: string;
  /** What the trigger shows. */
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className={triggerClassName}
        aria-label={triggerLabel}
        title={triggerTitle}
        data-profile-trigger
      >
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] transition-opacity duration-160 ease-out",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <Dialog.Popup
          data-profile-panel
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-6 overflow-y-auto",
            "border-r border-border bg-popover p-5 text-popover-foreground shadow-float",
            "transition-transform duration-200 ease-out",
            "data-ending-style:-translate-x-full data-starting-style:-translate-x-full",
          )}
        >
          <div className="flex items-start gap-3">
            <Avatar fullName={fullName} className="size-10" />
            <div className="flex min-w-0 flex-1 flex-col">
              <Dialog.Title className="truncate text-subheading font-semibold">
                {fullName}
              </Dialog.Title>
              <span className="truncate text-small text-muted-foreground">
                {t(`roles.${role}`)}
              </span>
            </div>
            <Dialog.Close
              render={<Button variant="ghost" size="icon" aria-label={t("common.close")} />}
            >
              <Icon name="close" />
            </Dialog.Close>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("profile.username")}</dt>
            <dd className="truncate font-semibold">{username}</dd>
            <dt className="text-muted-foreground">{t("profile.role")}</dt>
            <dd className="font-semibold">{t(`roles.${role}`)}</dd>
          </dl>
          <LanguageChoice current={locale} />
          <ThemeChoice />
          <div className="mt-auto border-t border-border pt-4">
            <SignOutButton kind="words" />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
