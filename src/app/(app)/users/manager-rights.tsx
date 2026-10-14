"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { toast } from "@/components/toast";
import { useAction } from "@/components/use-action";
import type { ManagerRight } from "@/domain/permissions";

import { switchManagerRightAction } from "./actions";

// The nine switches on a Manager's page (03-roles-and-permissions.md, "Manager rights the Head
// can switch"; build-plan 1.4): all on by default; a flip saves at once, one right per action
// (plan of 1.4, decision 3). Navy checkboxes, as the design system lists (docs/design-system.md,
// "Fields and switches"). An inactive Manager's rights are shown but not switched (Look first 2);
// the server refuses it too.

const noSubscription = () => () => undefined;

export function ManagerRights({
  user,
  rights,
}: {
  user: { id: string; isActive: boolean };
  rights: readonly { right: ManagerRight; enabled: boolean }[];
}) {
  const t = useTranslations("managerRights");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(switchManagerRightAction);
  const [busy, setBusy] = useState<ManagerRight | null>(null);
  // A click before hydration would do nothing (progress 1.1, "A form").
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  async function flip(right: ManagerRight, enabled: boolean) {
    setBusy(right);
    const result = await action.run({ id: user.id, right, enabled });
    setBusy(null);
    if (!result) return;
    if (!result.ok) toast.error(tAll(result.error.messageKey));
    else toast.success(t(enabled ? "switchedOn" : "switchedOff"));
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
      <h2 className="text-[17px] leading-6 font-bold">{t("title")}</h2>
      <p className="text-sm leading-5 text-muted-foreground">
        {t(user.isActive ? "intro" : "inactive")}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {rights.map(({ right, enabled }) => {
          const id = `right-${right}`;
          return (
            <li key={right}>
              <label
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-start justify-between gap-4 py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t(`names.${right}`)}</span>
                  <span className="text-sm leading-5 text-muted-foreground">
                    {t("whenOff", { text: t(`off.${right}`) })}
                  </span>
                </span>
                <input
                  id={id}
                  type="checkbox"
                  checked={enabled}
                  disabled={!hydrated || !user.isActive || busy !== null}
                  onChange={(event) => void flip(right, event.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-foreground"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
