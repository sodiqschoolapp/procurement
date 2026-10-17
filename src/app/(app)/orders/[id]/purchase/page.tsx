import { notFound } from "next/navigation";

import { PurchaseFormView } from "@/features/purchasing/components/purchase-form";
import { getPurchaseForm } from "@/features/purchasing/queries/purchase-form";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// /orders/[id]/purchase: the purchase form of one Open order (07-purchasing.md, Purchase record;
// 11-screens-and-ux.md, smooth feel 3, "Buying on a phone"; plan of 3.3). The Head and the order's owner
// with RECORD_PURCHASES on; anyone else, another branch's order, an order that is not Open or whose
// buying is finished are "Not found" (decided item 14). The server action asks everything again.

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}/purchase`);
  const form = await getPurchaseForm(user.id, id).catch((error: unknown) => {
    if (error instanceof AuthorizationError) return null;
    throw error;
  });
  if (!form) notFound();
  return <PurchaseFormView form={form} />;
}
