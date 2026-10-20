import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice, listMyBranches } from "@/features/catalog/queries/my-branches";
import { requireUser } from "@/server/auth/session";
import { authorizeList } from "@/server/authorize";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { SuggestionForm } from "../suggestion-form";

// /suggestions/new (build-plan 1.12; plan of 1.12, decision 4, Look first): a Manager, or the
// Head, asks for an item the catalog lacks. The branches offered are the person's active ones
// (decision 11), the branch view first; the server checks the branch again (03 rule 1).

export default async function NewSuggestionPage() {
  const user = await requireUser("/suggestions/new");
  // Principal and Finance get "Not found" (03 rule 1; Permission matrix).
  await readOrNotFound(() => authorizeList(user.id, "catalog.suggest"));
  const branches = (await listMyBranches(user.id)).filter((branch) => branch.isActive);
  const chosen = await currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value);
  const t = await getTranslations("suggestions");
  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <Link
        href="/suggestions"
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("back")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("newTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <SuggestionForm
        branches={branches.map(({ id, code, name }) => ({ id, code, name }))}
        defaultBranchId={
          branches.some((branch) => branch.id === chosen)
            ? chosen!
            : branches.length === 1
              ? branches[0]!.id
              : ""
        }
      />
    </div>
  );
}
