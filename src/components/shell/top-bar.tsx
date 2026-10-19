import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { Skeleton } from "@/components/skeleton";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice, listMyBranches } from "@/features/catalog/queries/my-branches";
import { countMyUnread } from "@/features/notifications/queries/my-notifications";

import { Bell } from "./bell";
import { BranchSelect } from "./branch-select";
import { Avatar } from "./person";
import { Search } from "./search";

// The top bar (docs/design-system.md, Layout shell; This app: "The branch switcher with 'All my
// branches' for a person with several branches; the search field; at the right the bell"):
// white (dark: --topbar), 64 high, a bottom border. The search (6.10) sits in the place 0.10b
// kept, left of the bell: a field with "Ctrl K" from 640 px, a search button below (plan of
// 6.10, decided item 7). The bell (0.11) stays at phone
// width too: /notifications is in no role's menu (plan of 0.11, decision 7). At phone width the
// avatar links to /profile, where sign-out is.

/** One branch: its name as text; several: the select; none: nothing (plan, decision 6). */
async function BranchContext({ userId }: { userId: string }) {
  const t = await getTranslations();
  const branches = await listMyBranches(userId);
  if (branches.length === 0) return null;
  if (branches.length === 1) {
    const [only] = branches;
    return (
      <p className="truncate text-sm leading-5 font-semibold">
        {t("branch.option", { code: only!.code, name: only!.name })}
      </p>
    );
  }
  const current = await currentBranchChoice(userId, (await cookies()).get(BRANCH_COOKIE)?.value);
  return <BranchSelect branches={branches} current={current} />;
}

/** The bell with the unread count, read inside a Suspense so no page waits for it (rule 5). */
async function BellCount({ userId }: { userId: string }) {
  return <Bell count={await countMyUnread(userId)} />;
}

export async function TopBar({ userId, fullName }: { userId: string; fullName: string }) {
  const t = await getTranslations();
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-topbar px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center">
        <Suspense
          fallback={
            <span aria-busy="true" className="block">
              <Skeleton className="h-11 w-56 max-w-full bg-secondary sm:h-10" />
            </span>
          }
        >
          <BranchContext userId={userId} />
        </Suspense>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Search />
        <Suspense
          fallback={
            <span aria-busy="true" className="block">
              <Skeleton className="size-11 bg-secondary sm:size-10" />
            </span>
          }
        >
          <BellCount userId={userId} />
        </Suspense>
        <Link
          href="/profile"
          aria-label={t("shell.profile")}
          className="flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:hidden"
        >
          <Avatar fullName={fullName} />
        </Link>
      </div>
    </header>
  );
}
