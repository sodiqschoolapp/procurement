import { getLocale, getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { requireUser } from "@/server/auth/session";

import { LanguageChoice } from "./language-choice";
import { ThemeChoice } from "./theme-choice";

// The profile (11-screens-and-ux.md, Screens: "Notifications, profile: All"): the person's name,
// username and role, the language (A2), the theme (rule 15), and sign-out, the only one at phone
// width, where the menu's is absent (plan of 0.10b, decision 11).
export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const t = await getTranslations();
  const locale = await getLocale();

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <h1 className="text-title">{t("profile.title")}</h1>
      <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
        <h2 className="text-subheading font-semibold">{user.fullName}</h2>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr] sm:gap-y-3">
          <dt className="text-sm text-muted-foreground">{t("profile.username")}</dt>
          <dd className="mb-2 font-semibold sm:mb-0">{user.username}</dd>
          <dt className="text-sm text-muted-foreground">{t("profile.role")}</dt>
          <dd className="font-semibold">{t(`roles.${user.role}`)}</dd>
        </dl>
        <LanguageChoice current={locale} />
        <ThemeChoice />
        <SignOutButton kind="words" />
      </section>
    </div>
  );
}
