"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Segmented } from "@/components/ui/segmented";

// The Head's "My drafts / Everyone's" (plan of 2.5b, decided item 15; 2.5a decided item 9: the
// Head sees his own drafts, or every owner's with `owners=all`), kept in the address
// (11-screens-and-ux.md rule 8).

export function OwnersSwitch({ all }: { all: boolean }) {
  const t = useTranslations("orders.owners");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Segmented
      label={t("label")}
      value={all ? "all" : "mine"}
      pending={pending}
      options={[
        { value: "mine", label: t("mine") },
        { value: "all", label: t("all") },
      ]}
      onValueChange={(value) =>
        start(() => router.push(value === "all" ? "/orders?owners=all" : "/orders"))
      }
    />
  );
}
