import { and, eq } from "drizzle-orm";
import * as z from "zod";

import { MANAGER_RIGHTS, type ManagerRight } from "@/domain/permissions";
import { GLOBAL_TARGET, ActionError, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { managerRights } from "@/server/db/schema";
import { notify } from "@/server/notify";

import { lockUser } from "./users";

// The nine Manager rights the Head switches (build-plan 1.4; 03-roles-and-permissions.md,
// "Manager rights the Head can switch"; A13; 14-data-model.md, manager_rights: "no row means
// enabled"). "Switch a Manager's rights on or off": manager_rights.switch, Head only, global (03,
// Permission matrix). authorize() reads the rights switched off on every call (decisions 0.7 item
// 7), so a switch counts at the Manager's next action in every branch.
//
// One switch is one action, one audit row and one notice (plan of 1.4, decision 3). The locks are
// those of every user write (progress 1.3): lockUser() takes them in their order.

export const switchManagerRightInput = z.object({
  id: z.uuid(),
  right: z.enum(MANAGER_RIGHTS),
  enabled: z.boolean(),
});

export type SwitchManagerRightInput = z.input<typeof switchManagerRightInput>;

export type SwitchedRight = { id: string; right: ManagerRight; enabled: boolean };

export const switchManagerRight = defineAction({
  name: "switchManagerRight",
  permission: "manager_rights.switch",
  input: switchManagerRightInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    const locked = await lockUser(tx, input.id);
    return locked ? { target: GLOBAL_TARGET, rows: locked } : null;
  },
  async write({ tx, input, locked }): Promise<SwitchedRight> {
    const { user } = locked!.rows;
    // "On each Manager's user page": rights are a Manager's only (plan of 1.4, Look first 1).
    if (user.role !== "MANAGER") throw new ActionError("invalid_input");
    // An inactive Manager could not be notified (plan of 1.4, Look first 2): activate first.
    if (!user.isActive) throw new ActionError("wrong_status");
    const [row] = await tx
      .select({ enabled: managerRights.enabled })
      .from(managerRights)
      .where(and(eq(managerRights.userId, user.id), eq(managerRights.right, input.right)));
    // "No row means enabled". The same switch twice is a stale screen, as setUserActive.
    if ((row?.enabled ?? true) === input.enabled) throw new ActionError("wrong_status");
    // `enabled` is switched in place; the history is the audit row (decisions 0.7 item 12).
    await tx
      .insert(managerRights)
      .values({ userId: user.id, right: input.right, enabled: input.enabled, createdAt: now() })
      .onConflictDoUpdate({
        target: [managerRights.userId, managerRights.right],
        set: { enabled: input.enabled },
      });
    return { id: user.id, right: input.right, enabled: input.enabled };
  },
  async history({ tx, userId }, result) {
    // "Every change is written to the audit log with the Head's name and the time" (03).
    await audit(
      { tx, userId },
      {
        action: "user.switch_right",
        entity: "users",
        entityId: result.id,
        before: { [result.right]: !result.enabled },
        after: { [result.right]: result.enabled },
        at: now(),
      },
    );
  },
  async notify({ tx, userId }, result) {
    // "… and the Manager is notified" (03; 10 Notifications). No branch: a right holds in all of
    // the Manager's branches (A13). The Manager cannot open /users/[id], so the link is home.
    await notify(
      { tx, userId },
      {
        to: [result.id],
        type: "MANAGER_RIGHT_SWITCHED",
        params: { right: result.right, state: result.enabled ? "on" : "off" },
        branchId: null,
        link: "/",
        at: now(),
      },
    );
  },
});
