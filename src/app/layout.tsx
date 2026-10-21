import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { THEME_SCRIPT } from "@/components/theme";
import { Toaster } from "@/components/toaster";

// Golos Text from the app's own files, never from Google Fonts at run time (docs/design-system.md,
// Type; plan of 0.10a, decision 2).
import "@fontsource-variable/golos-text";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: t("title"),
    // The shield on white (docs/design-system.md, Logo): browser tab and home screen.
    icons: {
      icon: [
        { url: "/brand/favicon.ico", sizes: "any" },
        { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/brand/icon-48.png", sizes: "48x48", type: "image/png" },
        { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: { url: "/brand/icon-180.png", sizes: "180x180", type: "image/png" },
    },
  };
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
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
