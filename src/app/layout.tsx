import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { THEME_SCRIPT } from "@/components/theme";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("start");
  return { title: t("title") };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();

  return (
    // The inline script sets data-theme from the kept choice before hydration, so <html> differs
    // from the server's markup on purpose (plan of 0.10a, decision 3).
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
