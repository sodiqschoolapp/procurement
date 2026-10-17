import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { MoneyWithManagers } from "@/features/money/components/money-with-managers";
import { getMoneyWithManagers } from "@/features/money/queries/money-with-managers";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// /money: Money with managers (11-screens-and-ux.md, Screens: "Finance, Head"; 08-money-and-
// settlement.md, Money with managers; plan of 4.9). It follows the top bar's branch choice, as the
// order list does (decided item 6). Any other role: "Not found" (03 rule 1).

export default async function MoneyPage() {
  const user = await requireUser("/money");
  const branch = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);
  const blocks = await getMoneyWithManagers(user.id, branch).catch((error: unknown) => {
    if (error instanceof AuthorizationError) return null;
    throw error;
  });
  if (!blocks) notFound();
  return <MoneyWithManagers blocks={blocks} />;
}
