import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { helpPage, loadHelp } from "@/features/help/content";
import { HelpText } from "@/features/help/help-text";
import { isLocale } from "@/i18n/locale";
import { getCurrentUser } from "@/server/auth/session";

import { LanguageSelect } from "../login/language-select";
import { ThemeButton } from "../login/theme-button";
import { ChapterSelect } from "./chapter-select";
import { HelpSearch } from "./help-search";

// The Help page (11-screens-and-ux.md, Help page; 03-roles-and-permissions.md rule 9; build-plan
// 9.7). Open to anyone: the proxy lets /help through without a session, and the page reads no
// data. It reads only the person's own session, when there is one, through getCurrentUser(),
// which every page's language choice already reads: a visitor without a session cookie costs no
// database read (plan of 9.7, decided item 13, Look first). A signed-in user reads it in their own
// language and sees "Back to Ombor"; a visitor chooses the language here, as on the sign-in page.
// Outside the (app) group, so the app shell, which needs a user, is not drawn (decided item 9).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("pageTitle") };
}

export default async function HelpPage() {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const t = await getTranslations("help");
  const chapters = helpPage(await loadHelp(isLocale(locale) ? locale : "uz"));

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="page-width flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={user ? "/" : "/login"} className="flex min-h-11 items-center">
            <Image
              src="/brand/sodiq-logo-horizontal.svg"
              alt={t("logo")}
              width={195}
              height={31}
              unoptimized
              priority
              className="h-7 w-auto dark:hidden"
            />
            <Image
              src="/brand/sodiq-logo-horizontal-on-dark.svg"
              alt={t("logo")}
              width={195}
              height={31}
              unoptimized
              priority
              className="hidden h-7 w-auto dark:block"
            />
          </Link>
          <div className="flex items-center gap-2">
            {!user && isLocale(locale) && <LanguageSelect current={locale} />}
            {!user && <ThemeButton />}
            <Link
              href={user ? "/" : "/login"}
              className={cn(buttonVariants({ variant: user ? "secondary" : "default" }))}
            >
              {user ? t("backToApp") : t("signIn")}
            </Link>
          </div>
        </div>
      </header>

      <div className="page-width grid gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-8">
        <nav aria-label={t("chapters")} className="hidden lg:block">
          <div className="sticky top-24 flex max-h-[calc(100dvh-7rem)] flex-col gap-1 overflow-y-auto">
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("chapters")}
            </p>
            {chapters.map((chapter) => (
              <a
                key={chapter.id}
                href={`#${chapter.id}`}
                data-help-link={chapter.id}
                className="rounded-control px-3 py-1.5 text-sm font-medium text-sidebar-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground"
              >
                {chapter.title}
              </a>
            ))}
          </div>
        </nav>

        <main className="flex max-w-3xl min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-title">{t("title")}</h1>
            <p className="text-muted-foreground">{t("intro")}</p>
          </div>
          <HelpSearch />
          <ChapterSelect chapters={chapters.map(({ id, title }) => ({ id, title }))} />

          {chapters.map((chapter) => (
            <section
              key={chapter.id}
              id={chapter.id}
              data-help-chapter
              className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-6"
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">{chapter.title}</h2>
                <p className="text-muted-foreground">{chapter.lead}</p>
              </div>
              {chapter.topics.map((topic) => (
                <article
                  key={topic.id}
                  id={topic.id}
                  data-help-topic
                  className="flex scroll-mt-24 flex-col gap-2"
                >
                  <h3 className="text-base font-semibold">{topic.title}</h3>
                  <HelpText text={topic.body} />
                </article>
              ))}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
