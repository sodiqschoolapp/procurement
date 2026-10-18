import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { businessDate } from "@/domain/business-date";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { IssueForm } from "@/features/warehouse/components/issue-form";
import { ReturnForm } from "@/features/warehouse/components/return-form";
import { issueBranchChoices, issueFormChoices } from "@/features/warehouse/queries/issue-form";
import { returnBranchChoices, returnFormChoices } from "@/features/warehouse/queries/return-form";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { now } from "@/server/clock";

// /warehouse/documents/new?type=ISSUE|RETURN, the new issue and the new return (11-screens-and-
// ux.md, Screens: "New issue, return, transfer, write-off | Manager, Head"; 09-warehouse.md, Issue
// to a department; Other documents: Return from a department; plans of 5.4 and 5.6). The transfer
// and the write-off come with 7.2 and 5.11: any other `type=` is "Not found", and so is the page
// for a user who may use the type in no branch (Principal, Finance, a Manager with ISSUE_STOCK or
// RETURN_REVERSE off; 03 rule 1). The branch is prefilled when the user may use one branch, else
// from the branch view; the form is keyed by it, so a change of the branch view (BranchSelect,
// which asks first while the form has unsaved changes) brings a fresh form without the old
// branch's lines.

type Params = { type?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Where the user may make each type: the branches of its permission. */
const BRANCHES = { ISSUE: issueBranchChoices, RETURN: returnBranchChoices } as const;

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = first((await searchParams).type);
  const user = await requireUser(
    `/warehouse/documents/new?type=${raw === "RETURN" ? "RETURN" : "ISSUE"}`,
  );
  if (raw !== "ISSUE" && raw !== "RETURN") notFound();

  let branches;
  try {
    branches = await BRANCHES[raw](user.id);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  if (branches.length === 0) notFound();

  const view = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);
  const initialBranchId =
    branches.length === 1
      ? branches[0]!.id
      : (branches.find((branch) => branch.id === view)?.id ?? "");
  const today = businessDate(now());

  if (raw === "RETURN") {
    const initialDepartments = initialBranchId
      ? await returnFormChoices(user.id, { branchId: initialBranchId })
      : [];
    const t = await getTranslations("warehouse.return");
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
        <ReturnForm
          key={initialBranchId}
          branches={branches}
          initialBranchId={initialBranchId}
          initialDepartments={initialDepartments}
          today={today}
        />
      </div>
    );
  }

  const initialDepartments = initialBranchId
    ? await issueFormChoices(user.id, { branchId: initialBranchId })
    : [];
  const t = await getTranslations("warehouse.issue");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
      <IssueForm
        key={initialBranchId}
        branches={branches}
        initialBranchId={initialBranchId}
        initialDepartments={initialDepartments}
        today={today}
      />
    </div>
  );
}
