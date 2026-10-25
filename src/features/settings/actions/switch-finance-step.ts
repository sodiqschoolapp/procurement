import { inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { storedSettingValue } from "@/domain/settings";
import { ActionError, GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { orders, settings } from "@/server/db/schema";
import { SETTINGS_LOCK, readSettings } from "@/server/settings";

// The Head switches the Finance step off or on for the whole school (06-approval-workflow.md,
// Finance step switched off; 03 Permission matrix: "Manage catalogs, users, branches, settings",
// Head only; plan of 4.10c, decided item 9). Its own action, beside the settings form, with its own
// confirmation on the screen. Under the settings lock taken exclusive, which the Principal's
// approval takes shared before it reads the step (src/server/settings.ts; decided item 1, Look
// first): switching off is refused while any order of any branch waits for Finance or for
// settlement, naming them (rule 5); switching on changes only the orders the Principal approves
// from then on (rule 6), so it writes the key alone. The same value again writes nothing. Every
// switch writes one audit row of the settings form's shape (rule 7). No client key: it changes a
// value and creates no record, as saveSettings.

export const switchFinanceStepInput = z.object({ on: z.boolean() }).strict();

export type SwitchedFinanceStep = { changed: boolean; on: boolean };

/** The statuses that refuse switching off (06 Finance step switched off 5). */
const WAITING_ON_FINANCE = ["PENDING_FINANCE", "SETTLEMENT"] as const;

export const switchFinanceStep = defineAction({
  name: "switchFinanceStep",
  permission: "catalog.manage",
  input: switchFinanceStepInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx }) {
    await tx.execute(SETTINGS_LOCK);
    return { target: GLOBAL_TARGET, rows: (await readSettings(tx)).finance_step };
  },
  async check({ tx, input, locked }) {
    if (input.on || !locked!.rows) return;
    // Read after the lock, in a statement of its own: an approval that read "on" has committed
    // its order Waiting for Finance before the lock was granted (READ COMMITTED).
    const waiting = await tx
      .select({ number: orders.number })
      .from(orders)
      .where(inArray(orders.status, [...WAITING_ON_FINANCE]))
      .orderBy(orders.number);
    if (waiting.length === 0) return;
    throw new ActionError(
      "invalid_input",
      { orders: "errors.field.financeStepWaiting" },
      { orders: waiting.map((order) => order.number).join(", ") },
    );
  },
  async write({ tx, input, locked }): Promise<SwitchedFinanceStep> {
    if (input.on === locked!.rows) return { changed: false, on: input.on };
    const value = storedSettingValue("finance_step", input.on);
    await tx
      .insert(settings)
      .values({ key: "finance_step", value, createdAt: now() })
      .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
    return { changed: true, on: input.on };
  },
  async history({ tx, userId }, result) {
    if (!result.changed) return;
    await audit(
      { tx, userId },
      {
        action: "settings.change",
        entity: "settings",
        entityId: "settings",
        before: { finance_step: !result.on },
        after: { finance_step: result.on },
        at: now(),
      },
    );
  },
});
