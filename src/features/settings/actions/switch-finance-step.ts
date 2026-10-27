import { sql } from "drizzle-orm";
import * as z from "zod";

import { priceAskAllowed } from "@/domain/order-fields";
import { storedSettingValue } from "@/domain/settings";
import { ActionError, GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { orders, settings } from "@/server/db/schema";
import type { SettingValues } from "@/domain/settings";
import { SETTINGS_LOCK, readSettings } from "@/server/settings";

import { financeStepBlockers } from "../finance-step-blockers";

// The Head switches the Finance step off or on for the whole school (06-approval-workflow.md,
// Finance step switched off; 03 Permission matrix: "Manage catalogs, users, branches, settings",
// Head only; plan of 4.10c, decided item 9). Its own action, beside the settings form, with its own
// confirmation on the screen. Under the settings lock taken exclusive, which the Principal's
// approval takes shared before it reads the step (src/server/settings.ts; decided item 1, Look
// first): switching off is refused while any order of any branch waits for Finance or for
// settlement, naming them (rule 5); switching on changes only the orders the Principal approves
// from then on (rule 6), so it writes the key alone; it is refused while the price is not required,
// then while an order without a planned price waits for Head or for Principal, naming them (rule 8;
// plan of 2.5d-b, decided item 7, Look first). A submit reads the price setting under the same
// lock taken shared, so an unpriced order it sends is seen here. The same value again writes nothing. Every
// switch writes one audit row of the settings form's shape (rule 7). No client key: it changes a
// value and creates no record, as saveSettings.

export const switchFinanceStepInput = z.object({ on: z.boolean() }).strict();

export type SwitchedFinanceStep = { changed: boolean; on: boolean };

export const switchFinanceStep = defineAction({
  name: "switchFinanceStep",
  permission: "catalog.manage",
  input: switchFinanceStepInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx }) {
    await tx.execute(SETTINGS_LOCK);
    const values: Pick<SettingValues, "finance_step" | "order_fields"> = await readSettings(tx);
    return { target: GLOBAL_TARGET, rows: values };
  },
  async check({ tx, input, locked }) {
    const { finance_step: on, order_fields: fields } = locked!.rows;
    if (input.on === on) return;
    if (input.on && !priceAskAllowed(fields, true)) {
      throw new ActionError("invalid_input", {
        orders: "errors.field.financeStepPriceNotRequired",
      });
    }
    // Read after the lock, in a statement of its own: an approval or a submit that read the
    // settings has committed before the lock was granted (READ COMMITTED).
    const waiting = await tx
      .select({ number: orders.number })
      .from(orders)
      .where(financeStepBlockers(input.on))
      .orderBy(orders.number);
    if (waiting.length === 0) return;
    throw new ActionError(
      "invalid_input",
      { orders: input.on ? "errors.field.financeStepUnpriced" : "errors.field.financeStepWaiting" },
      { orders: waiting.map((order) => order.number).join(", ") },
    );
  },
  async write({ tx, input, locked }): Promise<SwitchedFinanceStep> {
    if (input.on === locked!.rows.finance_step) return { changed: false, on: input.on };
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
