import { notFound } from "next/navigation";

// A mistyped address inside the app answers with the app's own "Not found" page, in the shell with
// its menu, instead of the bare page of Next.js (redesign of 21.10.2026). Every real page is a more
// specific route and wins over this one.
export default function MissingPage(): never {
  notFound();
}
