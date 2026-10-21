"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Segmented } from "@/components/ui/segmented";

// The Head's "My drafts / Everyone's" (plan of 2.5b, decided item 15; 2.5a decided item 9: the
// Head sees his own drafts, or every owner's with `owners=all`), kept in the address
// (11-screens-and-ux.md rule 8). The other parameters of the address stay (plan of 2.8).

export function OwnersSwitch({ all }: { all: boolean }) {
  const t = useTranslations("orders.owners");
  const router = useRouter();
  const current = useSearchParams();
  const [pending, start] = useTransition();
  // The order list's filters stay in the address; the grid goes back to its first page.
  const hrefOf = (value: string) => {
    const params = new URLSearchParams(current.toString());
    params.delete("draftsPage");
    if (value === "all") params.set("owners", "all");
    else params.delete("owners");
    const text = params.toString();
    return `/orders${text ? `?${text}` : ""}`;
  };
  return (
    <Segmented
      label={t("label")}
      value={all ? "all" : "mine"}
      pending={pending}
      options={[
        { value: "mine", label: t("mine") },
        { value: "all", label: t("all") },
      ]}
      onValueChange={(value) => start(() => router.push(hrefOf(value), { scroll: false }))}
    />
  );
}
