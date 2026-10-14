import { db } from "@/server/db/client";
import { now } from "@/server/clock";
import { notifications } from "@/server/db/schema";

// A notification written straight into the table for a test, at the moment of the clock
// (build-plan 0.11). The params and the link are invented.

export async function insertNotification(
  userId: string,
  overrides: Partial<typeof notifications.$inferInsert> = {},
) {
  const [row] = await db
    .insert(notifications)
    .values({
      userId,
      type: "BRANCH_ROLE_VACANT",
      params: { branch: "DEMO", role: "PRINCIPAL" },
      link: "/",
      createdAt: now(),
      ...overrides,
    })
    .returning();
  return row!;
}
