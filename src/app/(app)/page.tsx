import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/server/auth/session";

// Home, "My tasks" (11-screens-and-ux.md, Screens; 10-notifications-analytics-reports.md, Home
// page per role). Empty for every role until the tasks that fill it: the empty state says what
// will appear here and offers no button, as none of those actions works yet (plan of 0.10b,
// decision 10; 11 rule 12).
export default async function HomePage() {
  const user = await requireUser("/");
  const t = await getTranslations("home");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">{t("title")}</h1>
      <EmptyState title={t(`empty.${user.role}.title`)} line={t(`empty.${user.role}.line`)} />
    </div>
  );
}
