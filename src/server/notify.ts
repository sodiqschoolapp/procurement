import {
  type NotificationParamsOf,
  type SendableType,
  isInternalLink,
} from "@/domain/notifications";
import type { Executor } from "@/server/authorize";
import { bound } from "@/server/bound-sql";

import { insertNotifications } from "./notification-row.mjs";

// notify(): the notifications of one event, inside the caller's transaction (developer-rules.md
// rule 3: "write, add the history event, add notifications"; build-plan 0.11). An action calls it
// from its `notify` step with `WriteContext.tx`, so a rolled-back action leaves no notification.
// It never opens a transaction and checks no permission: the action did.

export type Notification<Type extends SendableType> = {
  /** Who is told: the user ids the calling task works out from the spec's table. */
  to: readonly string[];
  type: Type;
  params: NotificationParamsOf[Type];
  /** An address inside the app, such as `/requests/<id>`. */
  link: string;
  /** From the injected clock (CLAUDE.md rule 10); no database default. */
  at: Date;
};

/**
 * Writes one notification per recipient with the action's transaction and returns how many.
 * `userId` is who acted: the wrapper's user, left out of the recipients, since nobody is told of
 * their own act; `null` for a job with no acting user, such as the reminders of 8.1 (plan of 0.11,
 * decision 5; review of the plan, correction 1). A recipient named twice gets one row, an inactive
 * one none.
 */
export async function notify<Type extends SendableType>(
  context: { tx: Executor; userId: string | null },
  notification: Notification<Type>,
): Promise<number> {
  if (!isInternalLink(notification.link)) {
    throw new Error("Refused: a notification links only to an address inside the app.");
  }
  const { tx, userId } = context;
  return insertNotifications((text, values) => tx.execute(bound(text, values)), {
    userIds: notification.to,
    actorId: userId,
    type: notification.type,
    params: notification.params,
    link: notification.link,
    at: notification.at,
  });
}
