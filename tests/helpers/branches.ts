import { db } from "@/server/db/client";
import { now } from "@/server/clock";
import { managerRights, branches } from "@/server/db/schema";
import type { ManagerRight } from "@/domain/permissions";

import { type InventedBranch, inventedBranch } from "./invented";

// Branches and Manager rights in the database for tests (progress 0.4: "`insertBranch()`: 0.7").

export type InsertedBranch = InventedBranch & { id: string; address: string };

/** Inserts an invented branch, active unless told otherwise, at the moment of the clock. */
export async function insertBranch(
  options: Partial<InventedBranch> & { address?: string; isActive?: boolean } = {},
): Promise<InsertedBranch> {
  const { address = "Sinov ko'chasi 1", isActive = true, ...overrides } = options;
  const branch = inventedBranch(overrides);
  const [row] = await db
    .insert(branches)
    .values({ ...branch, address, isActive, createdAt: now() })
    .returning({ id: branches.id });
  return { ...branch, address, id: row!.id };
}

/** Switches one Manager right on or off (no row means enabled). */
export async function setManagerRight(
  userId: string,
  right: ManagerRight,
  enabled: boolean,
): Promise<void> {
  await db
    .insert(managerRights)
    .values({ userId, right, enabled, createdAt: now() })
    .onConflictDoUpdate({ target: [managerRights.userId, managerRights.right], set: { enabled } });
}
