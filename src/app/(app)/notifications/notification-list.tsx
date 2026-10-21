"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { useAction } from "@/components/use-action";
import { cn } from "@/components/utils";
import { isInternalLink } from "@/domain/notifications";

import { markAllNotificationsReadAction, openNotificationAction } from "./actions";

// The list of /notifications (plan of 0.11, Screens). Each row is a button: it marks the
// notification read and follows its link (decision 8). The row shows its pending state at once;
// a refusal says in plain words what happened (11-screens-and-ux.md rule 4). The link is asked
// again before it is followed (review of the plan, Should fix 6).

export type NotificationItem = { id: string; text: string; when: string; unread: boolean };

export function NotificationList({ items }: { items: readonly NotificationItem[] }) {
  const t = useTranslations();
  const router = useRouter();
  const action = useAction(openNotificationAction);
  const [opening, setOpening] = useState<string | null>(null);

  async function open(id: string) {
    setOpening(id);
    const result = await action.run({ id });
    if (!result) return;
    if (result.ok && isInternalLink(result.data.link)) {
      router.push(result.data.link);
      return;
    }
    setOpening(null);
    if (result.ok) return;
    toast.error(
      t(result.error.code === "not_found" ? "notifications.notYours" : result.error.messageKey),
    );
    if (result.error.code === "not_found") router.refresh();
  }

  return (
    <ul className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      {items.map((item) => (
        <li key={item.id} className="border-b last:border-b-0">
          <button
            type="button"
            data-testid="notification"
            data-unread={item.unread}
            disabled={action.pending}
            aria-busy={opening === item.id}
            onClick={() => open(item.id)}
            className={cn(
              "flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-120 ease-out hover:bg-accent sm:px-6",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              "disabled:cursor-progress",
            )}
          >
            <Icon
              name={opening === item.id ? "progress_activity" : "notifications"}
              className={cn("mt-0.5 shrink-0", opening === item.id && "animate-spin")}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn("text-sm", item.unread && "font-semibold")}>{item.text}</span>
              <span className="flex flex-wrap gap-x-3 text-sm leading-5 text-muted-foreground">
                <span>{item.when}</span>
                {item.unread && (
                  <span className="font-semibold text-foreground">{t("notifications.unread")}</span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Mark all as read": it loses nothing, so it asks no confirmation (plan of 0.11, Screens). */
export function MarkAllRead() {
  const t = useTranslations();
  const action = useAction(markAllNotificationsReadAction);

  return (
    <Button
      variant="secondary"
      icon="done_all"
      pending={action.pending}
      onClick={async () => {
        const result = await action.run({});
        if (!result) return;
        if (result.ok) {
          toast.success(t("notifications.markedAllRead", { count: result.data.count }));
          return;
        }
        toast.error(t(result.error.messageKey));
      }}
    >
      {t("notifications.markAllRead")}
    </Button>
  );
}
