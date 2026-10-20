import { notFound } from "next/navigation";

import { requireUser } from "@/server/auth/session";

// A mistyped address inside the app answers with the app's own "Not found" page, in the shell with
// its menu, instead of the bare page of Next.js (redesign of 21.10.2026). Every real page is a more
// specific route and wins over this one. It reads nothing; a signed-out visitor signs in first.
export default async function MissingPage(): Promise<never> {
  await requireUser("/");
  notFound();
}
