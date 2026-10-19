import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { directEntryBranchChoices } from "@/features/warehouse/queries/direct-entry-form";
import {
  issueBranchChoices,
  transferBranchChoices,
  writeOffBranchChoices,
} from "@/features/warehouse/queries/issue-form";
import { returnBranchChoices } from "@/features/warehouse/queries/return-form";
import { AuthorizationError } from "@/server/authorize";

// New issue, New return, Transfer, Write-off and Direct entry, each for whoever may make it in some branch,
// opening /warehouse/documents/new?type= (11-screens-and-ux.md, Screens: "New issue, return,
// transfer, write-off | Manager, Head"; plans of 5.4, 5.6, 5.8, 5.11, 7.1; shared by Stock on hand and
// the documents list, plan of 5.12, decided item 10). Each choices function asks its own
// permission; the form asks again.

/** Whether the user may use the type in any branch. */
async function mayUse(choices: (userId: string) => Promise<unknown[]>, userId: string) {
  try {
    return (await choices(userId)).length > 0;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

export async function NewDocumentButtons({ userId }: { userId: string }) {
  const [canIssue, canReturn, canEnterDirectly, canWriteOff, canTransfer] = await Promise.all([
    mayUse(issueBranchChoices, userId),
    mayUse(returnBranchChoices, userId),
    mayUse(directEntryBranchChoices, userId),
    mayUse(writeOffBranchChoices, userId),
    mayUse(transferBranchChoices, userId),
  ]);
  const t = await getTranslations("warehouse.stock");
  return (
    <>
      {canIssue && (
        <Link
          href="/warehouse/documents/new?type=ISSUE"
          className={cn(buttonVariants(), "max-sm:h-12")}
        >
          <Icon name="add" />
          {t("newIssue")}
        </Link>
      )}
      {canReturn && (
        <Link
          href="/warehouse/documents/new?type=RETURN"
          className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
        >
          <Icon name="undo" />
          {t("newReturn")}
        </Link>
      )}
      {canTransfer && (
        <Link
          href="/warehouse/documents/new?type=TRANSFER"
          className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
        >
          <Icon name="swap_horiz" />
          {t("transfer")}
        </Link>
      )}
      {canWriteOff && (
        <Link
          href="/warehouse/documents/new?type=WRITE_OFF"
          className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
        >
          <Icon name="delete" />
          {t("writeOff")}
        </Link>
      )}
      {canEnterDirectly && (
        <Link
          href="/warehouse/documents/new?type=DIRECT_ENTRY"
          className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
        >
          <Icon name="inventory_2" />
          {t("directEntry")}
        </Link>
      )}
    </>
  );
}

/** Whether the user may make a direct entry anywhere: the Head's Excel import button. */
export function mayEnterDirectly(userId: string): Promise<boolean> {
  return mayUse(directEntryBranchChoices, userId);
}
