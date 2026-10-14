"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

import { asksBeforeLeaving } from "./unsaved-changes";

// The unsaved-changes guard (11-screens-and-ux.md rule 6: "Leaving a form with unsaved changes
// asks first"; plan of 0.10a, decision 9). A form renders <UnsavedChangesGuard dirty={...} />.
// - Closing or reloading the tab: the browser's own question (the only one allowed there).
// - An in-app link: the click is caught on window in the capture phase, before Next.js sees it;
//   the confirm dialog asks, and "Leave" follows the link.
// - The back button: while dirty, a guard entry of the same address sits on top of the history;
//   going back lands on the form's own entry, the guard puts its entry back and asks, and
//   "Leave" goes back past both.
// The browser wiring is proved by the e2e test of the first form that uses it (progress, 0.10a).

type Pending = { kind: "link"; href: string } | { kind: "back" };

const GUARD_STATE = "unsavedChangesGuard";

export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const t = useTranslations("unsavedChanges");
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const leaving = useRef(false);
  const guarded = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    leaving.current = false;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (leaving.current) return;
      event.preventDefault();
      // Older browsers need returnValue set to show their question.
      event.returnValue = "";
    }

    function onClick(event: MouseEvent) {
      if (leaving.current || event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const asks = asksBeforeLeaving({
        dirty: true,
        current: window.location.href,
        href: anchor.href,
        button: event.button,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
      });
      if (!asks) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: "link", href: anchor.href });
    }

    function onPopState() {
      if (leaving.current) return;
      // Back from the guard entry to the form's own entry: put the guard back and ask.
      window.history.pushState({ [GUARD_STATE]: true }, "", window.location.href);
      setPending({ kind: "back" });
    }

    if (!guarded.current) {
      window.history.pushState({ [GUARD_STATE]: true }, "", window.location.href);
      guarded.current = true;
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirty]);

  function leave() {
    const target = pending;
    setPending(null);
    leaving.current = true;
    if (target?.kind === "back") {
      // Past the guard entry and the form's own entry.
      window.history.go(-2);
      return;
    }
    if (!target) return;
    const url = new URL(target.href);
    if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash);
    else window.location.assign(target.href);
  }

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      text={{ title: t("title"), result: t("result"), confirm: t("leave"), danger: true }}
      onConfirm={leave}
    />
  );
}
