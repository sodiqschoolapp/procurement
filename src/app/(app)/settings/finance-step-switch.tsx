"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import type { FinanceStepWaiting } from "@/features/settings/queries/settings";

import { switchFinanceStepAction } from "./actions";

// The Finance step block of /settings (06-approval-workflow.md, Finance step switched off; plan
// of 4.10c, decided items 9 and 10). The state, one button behind the confirm dialog that states
// the result (11 rule 6), and while the step is on, the orders that keep it from being switched
// off, each a link. The server decides: a refusal is shown with the numbers it names, and the
// page is read again.

export function FinanceStepSwitch({
  on,
  waiting,
  priceRequired,
}: {
  on: boolean;
  /**
   * The orders that refuse the next switch: while on, those waiting for Finance or settlement;
   * while off, those without a planned price waiting for Head or Principal (06 rules 5 and 8).
   */
  waiting: readonly FinanceStepWaiting[];
  /** The price is required in the order fields: switching on is refused otherwise (06 rule 8). */
  priceRequired: boolean;
}) {
  const t = useTranslations("settings.financeStep");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(switchFinanceStepAction);
  const [open, setOpen] = useState(false);

  async function confirm() {
    try {
      const result = await action.run({ on: !on });
      if (!result) return;
      if (!result.ok) {
        const numbers = result.error.available?.orders;
        const field = result.error.fields?.orders;
        toast.error(
          numbers
            ? t(on ? "refused" : "refusedUnpriced", { orders: numbers })
            : tAll(field ?? result.error.messageKey),
        );
        router.refresh();
        return;
      }
      toast.success(t(on ? "switchedOff" : "switchedOn"));
      router.refresh();
    } finally {
      setOpen(false);
    }
  }

  return (
    <section
      aria-labelledby="finance-step-title"
      data-finance-step={on ? "on" : "off"}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id="finance-step-title" className="text-subheading font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm leading-5">{t(on ? "isOn" : "isOff")}</p>
      <p className="text-sm leading-5 text-muted-foreground">{t("hint")}</p>
      {!on && !priceRequired ? (
        <p data-finance-step-price className="text-sm leading-5 font-semibold">
          {tAll("errors.field.financeStepPriceNotRequired")}
        </p>
      ) : null}
      {waiting.length > 0 ? (
        <div className="flex flex-col gap-2" data-finance-step-waiting>
          <p className="text-sm leading-5 font-semibold">
            {t(on ? "waiting" : "unpriced", { count: waiting.length })}
          </p>
          <ul className="flex flex-col gap-1">
            {waiting.map((order) => (
              <li key={order.id} className="text-sm leading-5">
                <Link
                  href={`/orders/${order.id}`}
                  className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline sm:min-h-0"
                >
                  {order.number}
                </Link>{" "}
                <span className="text-muted-foreground">
                  {t("waitingLine", {
                    branch: order.branchCode,
                    status: tAll(`requestStatus.${order.status}`),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto sm:self-start"
      >
        {t(on ? "switchOff" : "switchOn")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={action.pending}
        onConfirm={confirm}
        text={{
          title: t(on ? "switchOffTitle" : "switchOnTitle"),
          result: t(on ? "switchOffResult" : "switchOnResult"),
          confirm: t(on ? "switchOff" : "switchOn"),
        }}
      />
    </section>
  );
}
