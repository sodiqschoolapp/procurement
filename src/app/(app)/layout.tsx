import type { ReactNode } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";
import { TopBar } from "@/components/shell/top-bar";
import { requireUser } from "@/server/auth/session";

// The shell of every signed-in page (docs/design-system.md, Layout shell; 11-screens-and-ux.md
// rule 1: "A sidebar on desktop and a bottom tab bar on phones"): the menu per role, the top bar
// with the branch context, and the page. A signed-out request goes to sign-in and comes back.
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser("/");

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar role={user.role} fullName={user.fullName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userId={user.id} fullName={user.fullName} />
        <main className="flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pb-8">{children}</main>
      </div>
      <TabBar role={user.role} />
    </div>
  );
}
