"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { hasUnsavedChanges } from "@/components/unsaved-changes-guard";
import { unreadCountLabel } from "@/domain/notifications";

// The bell (10-notifications-analytics-reports.md, Notifications: "an in-app bell with an unread
// count"; docs/design-system.md, Layout shell: "at the right the notifications button"). With
// nothing unread a quiet icon button; with unread an icon-and-text button of the medium size, the
// count a plain number in the text colour: no pill, no dot, no orange ("What we never do" 4 and
// 12; 11-screens-and-ux.md rule 11; plan of 0.11, review of the plan, Must fix 1). It opens
// /notifications.
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
      className={buttonVariants({ variant: "ghost", size: label === null ? "icon" : "default" })}
    >
      <Icon name="notifications" />
      {label !== null && (
        <span aria-hidden="true" className="tabular-nums">
          {label}
        </span>
      )}
    </Link>
  );
}
