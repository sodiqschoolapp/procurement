import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  countMyUnread,
  listMyNotifications,
} from "@/features/notifications/queries/my-notifications";
import {
  MONEY_PARAMS,
  PARAM_DEFAULTS,
  NOTIFICATIONS_MAX_PAGE,
  type NotificationParams,
  type SendableType,
} from "@/domain/notifications";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { MarkAllRead, NotificationList } from "./notification-list";

// /notifications (11-screens-and-ux.md, Screens: "Notifications, profile: All";
// 10-notifications-analytics-reports.md, Notifications). The person's own notifications, newest
// first, 25 a page with the page in the address (rule 8); the text of each comes from the
// message files by its type (build-plan 0.11); time as `08.10.2026 14:05`, Tashkent (rule 10).

// A page number the list cannot have goes to page 1 (spec review of 0.11).
const pageParam = z.coerce.number().int().min(1).max(NOTIFICATIONS_MAX_PAGE).catch(1);

/**
 * A row's params with each money param shown as money, "650 000 so'm" (plan of 0.11, decision 9),
 * and a param an earlier task's row lacks at its default (PARAM_DEFAULTS; plan of 4.3, item 7).
 */
function shownParams(
  type: SendableType,
  params: NotificationParams,
  money: (amount: bigint) => string,
): NotificationParams {
  const shown: Record<string, string | number> = { ...PARAM_DEFAULTS[type], ...params };
  for (const key of MONEY_PARAMS[type] ?? []) {
    const value = params[key];
    if (typeof value === "string" && /^[0-9]{1,19}$/.test(value)) shown[key] = money(BigInt(value));
  }
  return shown;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireUser("/notifications");
  const t = await getTranslations();
  const format = await getFormatters();
  const raw = (await searchParams).page;
  const page = pageParam.parse(Array.isArray(raw) ? raw[0] : raw);

  const [list, unread] = await Promise.all([
    listMyNotifications(user.id, { page }),
    countMyUnread(user.id),
  ]);
  // A page past the last one shows the first, never an empty panel (spec review of 0.11).
  if (list.rows.length === 0 && page > 1) redirect("/notifications");
  const items = list.rows.map((row) => ({
    id: row.id,
    // notify() writes only a type with a text (decision 10), so every row has one.
    text: t(
      `notifications.types.${row.type as SendableType}`,
      shownParams(row.type as SendableType, row.params, format.money),
    ),
    when: `${format.date(row.createdAt)} ${format.time(row.createdAt)}`,
    unread: row.readAt === null,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {t("notifications.title")}
          {unread > 0 && (
            <span className="text-sm font-normal tracking-normal text-muted-foreground">
              {t("notifications.unreadFact", { count: unread })}
            </span>
          )}
        </h1>
        {unread > 0 && <MarkAllRead />}
      </div>
      {items.length === 0 ? (
        <EmptyState title={t("notifications.empty.title")} line={t("notifications.empty.line")} />
      ) : (
        <NotificationList items={items} />
      )}
      {(page > 1 || list.hasMore) && (
        <nav
          aria-label={t("notifications.pages")}
          className="flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link
              href={`/notifications?page=${page - 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("notifications.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">{t("notifications.page", { page })}</span>
          {list.hasMore ? (
            <Link
              href={`/notifications?page=${page + 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("notifications.next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
