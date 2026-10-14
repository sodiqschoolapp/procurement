import { eq } from "drizzle-orm";
import * as z from "zod";

import { LOCALES } from "@/i18n/locale";
import { GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { users } from "@/server/db/schema";

// The person's own language (02-assumptions.md A2: "Each user picks one"), chosen on /profile.
// Through the action wrapper with its global form: profile.edit names no branch, the person's
// own `users` row is the lock (plan of 0.10b, decisions 1 and 4, Look first). `users` has no
// version column. The change writes an audit row in the same transaction (decision 2, Look
// first; developer-rules.md rule 13).

export const chooseOwnLanguage = defineAction({
  name: "chooseOwnLanguage",
  permission: "profile.edit",
  input: z.object({ locale: z.enum(LOCALES) }),
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, userId }) {
    const [row] = await tx
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    return row ? { target: GLOBAL_TARGET, rows: row } : null;
  },
  async write({ tx, input, userId, locked }) {
    // The same language again changes nothing: no write, so no row changes without its audit
    // row (developer-rules.md rule 13).
    if (locked?.rows.locale === input.locale) return { locale: input.locale };
    await tx
      .update(users)
      .set({ locale: input.locale, updatedAt: now() })
      .where(eq(users.id, userId));
    return { locale: input.locale };
  },
  async history({ tx, userId, locked }, result) {
    const before = locked?.rows.locale;
    // The same language again changes nothing worth a row.
    if (before === result.locale) return;
    await audit(
      { tx, userId },
      {
        action: "user.change_language",
        entity: "users",
        entityId: userId,
        before: { locale: before },
        after: { locale: result.locale },
        at: now(),
      },
    );
  },
});
