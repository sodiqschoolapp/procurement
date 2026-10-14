import { notFound } from "next/navigation";

import { AuthorizationError } from "@/server/authorize";

/**
 * A role without "Manage … branches" gets "not found", as an address of another branch does
 * (03 rule 1; plan of 1.1, decision 12).
 */
export async function readOrNotFound<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
}
