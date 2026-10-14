import { getLocale, getTranslations } from "next-intl/server";

import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">{t("profile.title")}</h1>
      <section className="flex flex-col gap-6 rounded-xl bg-card p-6 text-card-foreground">
        <p className="text-lg leading-7 font-semibold">{user.fullName}</p>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr] sm:gap-y-3">
          <dt className="text-sm text-muted-foreground">{t("profile.username")}</dt>
          <dd className="mb-2 font-semibold sm:mb-0">{user.username}</dd>
          <dt className="text-sm text-muted-foreground">{t("profile.role")}</dt>
          <dd className="font-semibold">{t(`roles.${user.role}`)}</dd>
        </dl>
        <LanguageChoice current={locale} />
        <ThemeChoice />
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" icon="logout">
            {t("session.signOut")}
          </Button>
        </form>
      </section>
    </div>
  );
}
