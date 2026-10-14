"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/login/actions";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";

// Sign-out, a form with the server action (A8). The button shows its loading state at once
// (11-screens-and-ux.md rule 4): disabled, `aria-busy`, the turning icon in place of `logout`.

function IconSubmit({ className }: { className?: string }) {
  const t = useTranslations("session");
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={t("signOut")}
      title={t("signOut")}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn("disabled:cursor-progress", className)}
    >
      <Icon
        name={pending ? "progress_activity" : "logout"}
        className={cn(pending && "animate-spin")}
      />
    </button>
  );
}

function WordsSubmit() {
  const t = useTranslations("session");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" icon="logout" pending={pending}>
      {t("signOut")}
    </Button>
  );
}

/** The menu's icon button, or the profile's secondary button with its words. */
export function SignOutButton({ kind, className }: { kind: "icon" | "words"; className?: string }) {
  return (
    <form action={signOutAction}>
      {kind === "icon" ? <IconSubmit className={className} /> : <WordsSubmit />}
    </form>
  );
}
