import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { businessDate } from "@/domain/business-date";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { DirectEntryForm } from "@/features/warehouse/components/direct-entry-form";
import { IssueForm } from "@/features/warehouse/components/issue-form";
import { ReturnForm } from "@/features/warehouse/components/return-form";
import { TransferForm } from "@/features/warehouse/components/transfer-form";
import { WriteOffForm } from "@/features/warehouse/components/write-off-form";
import { directEntryBranchChoices } from "@/features/warehouse/queries/direct-entry-form";
import {
  issueBranchChoices,
  issueFormChoices,
  transferBranchChoices,
  writeOffBranchChoices,
} from "@/features/warehouse/queries/issue-form";
import { returnBranchChoices, returnFormChoices } from "@/features/warehouse/queries/return-form";
import { transferDestinationChoices } from "@/features/warehouse/queries/transfer-form";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { now } from "@/server/clock";

// /warehouse/documents/new?type=ISSUE|RETURN|DIRECT_ENTRY|WRITE_OFF|TRANSFER, the new issue, the
// new return, the direct entry, the write-off and the transfer (11-screens-and-ux.md, Screens:
// "New issue, return, transfer, write-off | Manager, Head"; 09-warehouse.md, Issue to a
// department; Other documents: Return from a department, Transfer, Write-off; Direct entry by the
// Head; plans of 5.4, 5.6, 5.8, 5.11 and 7.1). Any other `type=` is "Not found", and so is the
// page for a user who may use the type in no branch (Principal, Finance, a Manager with
// ISSUE_STOCK, RETURN_REVERSE, WRITE_OFF_COUNT or TRANSFER_STOCK off, any Manager for a direct
// entry; 03 rule 1). The branch is prefilled when the user may use one branch, else
// from the branch view; the form is keyed by it, so a change of the branch view (BranchSelect,
// which asks first while the form has unsaved changes) brings a fresh form without the old
// branch's lines.

type Params = { type?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Where the user may make each type: the branches of its permission. */
const BRANCHES = {
  ISSUE: issueBranchChoices,
  RETURN: returnBranchChoices,
  DIRECT_ENTRY: directEntryBranchChoices,
  WRITE_OFF: writeOffBranchChoices,
  TRANSFER: transferBranchChoices,
} as const;

const isType = (value: string | undefined): value is keyof typeof BRANCHES =>
  value !== undefined && Object.hasOwn(BRANCHES, value);

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = first((await searchParams).type);
  const user = await requireUser(`/warehouse/documents/new?type=${isType(raw) ? raw : "ISSUE"}`);
  if (!isType(raw)) notFound();

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

  if (raw === "DIRECT_ENTRY") {
    const t = await getTranslations("warehouse.directEntry");
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
        <DirectEntryForm
          key={initialBranchId}
          branches={branches}
          initialBranchId={initialBranchId}
          today={today}
        />
      </div>
    );
  }

  if (raw === "WRITE_OFF") {
    const t = await getTranslations("warehouse.writeOff");
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
        <WriteOffForm
          key={initialBranchId}
          branches={branches}
          initialBranchId={initialBranchId}
          today={today}
          // The Head's own write-off is posted at once (plan of 5.11, decided item 1); the server
          // decides it the same way, this only words the confirmation.
          postsAtOnce={user.role === "HEAD"}
        />
      </div>
    );
  }

  if (raw === "TRANSFER") {
    const initialDestinations = initialBranchId
      ? await transferDestinationChoices(user.id, { branchId: initialBranchId })
      : [];
    const t = await getTranslations("warehouse.transfer");
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
        <TransferForm
          key={initialBranchId}
          branches={branches}
          initialBranchId={initialBranchId}
          initialDestinations={initialDestinations}
          today={today}
        />
      </div>
    );
  }

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
