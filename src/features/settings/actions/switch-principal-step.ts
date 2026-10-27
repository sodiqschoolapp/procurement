import { sql } from "drizzle-orm";
import * as z from "zod";

import { type SettingValues, storedSettingValue } from "@/domain/settings";
import { ActionError, GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { orders, settings } from "@/server/db/schema";
import { SETTINGS_LOCK, readSettings } from "@/server/settings";

import { principalStepBlockers } from "../finance-step-blockers";

// The Head switches the Principal step off or on for the whole school (06-approval-workflow.md,
// Principal step switched off; 03 Permission matrix: "Manage catalogs, users, branches, settings",
// Head only; plan of 4.10d, decided items 7 and 12). Its own action, beside the settings form, with
// its own confirmation on the screen, as the Finance step's switch. Under the settings lock taken
// exclusive, which the Head's approval and a Head-created Submit take shared before they read the
// step (src/server/settings.ts; decided item 1, Look first): switching off is refused while any
// order of any branch waits for the Principal, naming them (rule 4); switching on changes only the
// orders the Head approves from then on (rule 5), so it writes the key alone and is never refused.
// The same value again writes nothing. Every switch writes one audit row of the settings form's
// shape (rule 7). No client key: it changes a value and creates no record, as saveSettings.

export const switchPrincipalStepInput = z.object({ on: z.boolean() }).strict();

export type SwitchedPrincipalStep = { changed: boolean; on: boolean };

export const switchPrincipalStep = defineAction({
  name: "switchPrincipalStep",
  permission: "catalog.manage",
  input: switchPrincipalStepInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx }) {
    await tx.execute(SETTINGS_LOCK);
    const values: Pick<SettingValues, "principal_step"> = await readSettings(tx);
    return { target: GLOBAL_TARGET, rows: values };
  },
  async check({ tx, input, locked }) {
    if (input.on || input.on === locked!.rows.principal_step) return;
    // Read after the lock, in a statement of its own: an approval or a submit that read the
    // settings has committed before the lock was granted (READ COMMITTED).
    const waiting = await tx
      .select({ number: orders.number })
      .from(orders)
      .where(principalStepBlockers())
      .orderBy(orders.number);
    if (waiting.length === 0) return;
    throw new ActionError(
      "invalid_input",
      { orders: "errors.field.principalStepWaiting" },
      { orders: waiting.map((order) => order.number).join(", ") },
    );
  },
  async write({ tx, input, locked }): Promise<SwitchedPrincipalStep> {
    if (input.on === locked!.rows.principal_step) return { changed: false, on: input.on };
    const value = storedSettingValue("principal_step", input.on);
    await tx
      .insert(settings)
      .values({ key: "principal_step", value, createdAt: now() })
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
        before: { principal_step: !result.on },
        after: { principal_step: result.on },
        at: now(),
      },
    );
  },
});
