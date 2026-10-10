import type { Metadata } from "next";
import type { ReactNode } from "react";

import messages from "@/i18n/messages/uz.json";

import "./globals.css";

export const metadata: Metadata = {
  title: messages.start.title,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="uz">
      <body className="antialiased">{children}</body>
    </html>
  );
}
