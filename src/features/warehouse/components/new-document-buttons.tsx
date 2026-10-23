import { getTranslations } from "next-intl/server";

import { directEntryBranchChoices } from "@/features/warehouse/queries/direct-entry-form";
import {
  issueBranchChoices,
  transferBranchChoices,
  writeOffBranchChoices,
} from "@/features/warehouse/queries/issue-form";
import { returnBranchChoices } from "@/features/warehouse/queries/return-form";
import { AuthorizationError } from "@/server/authorize";

import { type DocumentAction, DocumentActions } from "./document-actions";

// New issue, New return, Transfer, Write-off and Direct entry, each for whoever may make it in some branch,
// opening /warehouse/documents/new?type= (11-screens-and-ux.md, Screens: "New issue, return,
// transfer, write-off | Manager, Head"; plans of 5.4, 5.6, 5.8, 5.11, 7.1; shared by Stock on hand and
// the documents list, plan of 5.12, decided item 10). Each choices function asks its own
// permission; the form asks again. DocumentActions draws them, folded behind More on a phone.

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
  const actions: DocumentAction[] = [
    canIssue && { type: "ISSUE", label: t("newIssue"), icon: "add" as const },
    canReturn && { type: "RETURN", label: t("newReturn"), icon: "undo" as const },
    canTransfer && { type: "TRANSFER", label: t("transfer"), icon: "swap_horiz" as const },
    canWriteOff && { type: "WRITE_OFF", label: t("writeOff"), icon: "delete" as const },
    canEnterDirectly && {
      type: "DIRECT_ENTRY",
      label: t("directEntry"),
      icon: "inventory_2" as const,
    },
  ]
    .filter((action) => action !== false)
    .map((action) => ({ ...action, href: `/warehouse/documents/new?type=${action.type}` }));
  return <DocumentActions actions={actions} />;
}

/** Whether the user may make a direct entry anywhere: the Head's Excel import button. */
export function mayEnterDirectly(userId: string): Promise<boolean> {
  return mayUse(directEntryBranchChoices, userId);
}
