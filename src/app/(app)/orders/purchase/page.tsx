import { notFound } from "next/navigation";

import { PurchaseFormView } from "@/features/purchasing/components/purchase-form";
import { getPurchaseForm } from "@/features/purchasing/queries/purchase-form";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// /orders/purchase?ids=…: one shop visit recorded once for the ticked Open orders and group rows
// (07-purchasing.md, One trip, many orders; plan of 3.4). The Head and the owner with
// RECORD_PURCHASES on; the query drops what the user may not see and takes the orders the user
// may record (decided items 9 to 11). Nothing recordable, two branches, or no ids: "Not found".
// The server action asks everything again.

export default async function TripPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { ids } = await searchParams;
  const user = await requireUser("/orders");
  const list = (typeof ids === "string" ? ids : "").split(",").filter((id) => id !== "");
  if (list.length === 0) notFound();
  const form = await getPurchaseForm(user.id, list).catch((error: unknown) => {
    if (error instanceof AuthorizationError) return null;
    throw error;
  });
  if (!form) notFound();
  return <PurchaseFormView form={form} backHref="/orders" />;
}
