import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";

// Home, "My tasks" (11-screens-and-ux.md, Screens; 10-notifications-analytics-reports.md, Home
// page per role). Empty for every role until the tasks that fill it: the empty state says what
// will appear here and offers no button, as none of those actions works yet (plan of 0.10b,
// decision 10; 11 rule 12). A Manager has one way in to the product suggestions here until the
// request editor's product search offers it (plan of 1.12, decision 4, Look first); task 6.1
// keeps the link beside its three buttons.
export default async function HomePage() {
  const user = await requireUser("/");
  const t = await getTranslations("home");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
      {user.role === "MANAGER" && (
        <Link
          href="/suggestions"
          className={buttonVariants({
            variant: "secondary",
            className: "w-full sm:w-auto sm:self-start",
          })}
        >
          {t("suggest")}
        </Link>
      )}
      <EmptyState title={t(`empty.${user.role}.title`)} line={t(`empty.${user.role}.line`)} />
    </div>
  );
}
