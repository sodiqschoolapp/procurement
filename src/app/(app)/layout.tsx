import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";
import { TopBar } from "@/components/shell/top-bar";
import { getSchoolName } from "@/features/settings/queries/settings";
import { RETURN_PATH_HEADER } from "@/server/auth/return-path";
import { requireUser } from "@/server/auth/session";

// The shell of every signed-in page (docs/design-system.md, Layout shell; 11-screens-and-ux.md
// rule 1: "A sidebar on desktop and a bottom tab bar on phones"): the menu per role, the top bar
// with the branch context, and the page. A signed-out request goes to sign-in and comes back to
// the page it asked for, which the proxy names (edge-cases/system.md).
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser((await headers()).get(RETURN_PATH_HEADER) ?? "/");
  // The school name under the logo, once the Head has set it (plan of 1.1, decision 13).
  const schoolName = await getSchoolName(user.id);
  // The person's own panel in the menu and the top bar (ProfilePanel).
  const person = {
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: await getLocale(),
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar person={person} schoolName={schoolName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userId={user.id} person={person} />
        {/* One content column on every page (docs/design-system.md, Spacing: content width). */}
        <main className="flex-1 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 sm:pb-12 lg:px-8">
          <div className="page-width">{children}</div>
        </main>
      </div>
      <TabBar role={user.role} />
    </div>
  );
}
