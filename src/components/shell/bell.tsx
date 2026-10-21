"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { hasUnsavedChanges } from "@/components/unsaved-changes-guard";
import { unreadCountLabel } from "@/domain/notifications";

// The bell (10-notifications-analytics-reports.md, Notifications: "an in-app bell with an unread
// count"; docs/design-system.md, Page shell). With nothing unread a quiet icon button; with unread
// the icon and the count as a small number on the orange highlight ("needs you now"), navy text on
// it, never a dot that only says "something". It opens /notifications.
//
// The count is read by the server. App Router keeps the layout across client navigation, so the
// bell refreshes the page's server parts on window focus and every 60 seconds while the tab is
// visible, held while a form has unsaved changes (plan of 0.11, decision 6).

export const BELL_REFRESH_MS = 60_000;

export function Bell({ count }: { count: number }) {
  const t = useTranslations();
  const router = useRouter();
  const label = unreadCountLabel(count);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible" || hasUnsavedChanges()) return;
      router.refresh();
    }
    const timer = window.setInterval(refresh, BELL_REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return (
    <Link
      href="/notifications"
      // The name holds the number shown, "99+" included (WCAG 2.5.3; plan of 9.1d).
      aria-label={
        label === null || label === String(count)
          ? t("notifications.bell", { count })
          : t("notifications.bellMany", { shown: label })
      }
      data-testid="bell"
      className={cn(
        buttonVariants({ variant: "ghost", size: label === null ? "icon" : "default" }),
        label !== null && "gap-1.5 px-2.5",
      )}
    >
      <Icon name="notifications" />
      {label !== null && (
        <span
          aria-hidden="true"
          className="min-w-5 rounded-full bg-brand px-1.5 text-center text-xs leading-5 font-semibold text-brand-foreground"
        >
          {label}
        </span>
      )}
    </Link>
  );
}
