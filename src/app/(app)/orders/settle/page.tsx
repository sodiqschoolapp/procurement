import { notFound } from "next/navigation";

import { SettlementView } from "@/features/money/components/settlement-view";
import { getSettlement } from "@/features/money/queries/settlement";
import { wireSettlement } from "@/features/money/settlement-wire";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// /orders/settle?ids=…: Finance's settlement screen for the ticked orders Waiting for settlement
// of one branch (08-money-and-settlement.md, Closing 2; plan of 4.5, decided items 4 and 15).
// The query drops what the user may not see; a role that may not settle, nothing left, two
// branches or no ids: "Not found". Every action of the screen asks the server again.

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { ids } = await searchParams;
  const user = await requireUser("/orders");
  const list = (typeof ids === "string" ? ids : "").split(",").filter((id) => id !== "");
  if (list.length === 0) notFound();
  const settlement = await getSettlement(user.id, list).catch((error: unknown) => {
    if (error instanceof AuthorizationError) return null;
    throw error;
  });
  if (!settlement) notFound();
  return <SettlementView settlement={wireSettlement(settlement)} />;
}
