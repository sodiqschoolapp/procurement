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

import { switchFinanceStepAction, switchPrincipalStepAction } from "./actions";

// The Principal step and the Finance step blocks of /settings (06-approval-workflow.md, Principal
// step switched off; Finance step switched off; plan of 4.10c, decided items 9 and 10; plan of
// 4.10d, decided items 12 and 13). The state, one button behind the confirm dialog that states the
// result (11 rule 6), and the orders that keep the step from being switched, each a link. The
// server decides: a refusal is shown with the numbers it names, and the page is read again.

/** The texts of one block, translated by its wrapper with its own namespace. */
type StepTexts = {
  title: string;
  state: string;
  hint: string;
  waiting: string;
  waitingLine: (order: FinanceStepWaiting) => string;
  refused: (orders: string) => string;
  button: string;
  confirmTitle: string;
  confirmResult: string;
  switched: string;
};

/** The Principal step block (06 Principal step switched off; plan of 4.10d). */
export function PrincipalStepSwitch({
  on,
  waiting,
}: {
  on: boolean;
  /** While on, the orders waiting for the Principal (06 Principal step switched off 4). */
  waiting: readonly FinanceStepWaiting[];
}) {
  const t = useTranslations("settings.principalStep");
  const tAll = useTranslations();
  return (
    <StepBlock
      step="principal"
      on={on}
      waiting={waiting}
      run={switchPrincipalStepAction}
      texts={{
        title: t("title"),
        state: t(on ? "isOn" : "isOff"),
        hint: t("hint"),
        waiting: t("waiting", { count: waiting.length }),
        waitingLine: (order) =>
          t("waitingLine", {
            branch: order.branchCode,
            status: tAll(`requestStatus.${order.status}`),
          }),
        refused: (orders) => t("refused", { orders }),
        button: t(on ? "switchOff" : "switchOn"),
        confirmTitle: t(on ? "switchOffTitle" : "switchOnTitle"),
        confirmResult: t(on ? "switchOffResult" : "switchOnResult"),
        switched: t(on ? "switchedOff" : "switchedOn"),
      }}
    />
  );
}

/** The Finance step block (06 Finance step switched off; plan of 4.10c). */
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
  return (
    <StepBlock
      step="finance"
      on={on}
      waiting={waiting}
      run={switchFinanceStepAction}
      note={!on && !priceRequired ? tAll("errors.field.financeStepPriceNotRequired") : null}
      texts={{
        title: t("title"),
        state: t(on ? "isOn" : "isOff"),
        hint: t("hint"),
        waiting: t(on ? "waiting" : "unpriced", { count: waiting.length }),
        waitingLine: (order) =>
          t("waitingLine", {
            branch: order.branchCode,
            status: tAll(`requestStatus.${order.status}`),
          }),
        refused: (orders) => t(on ? "refused" : "refusedUnpriced", { orders }),
        button: t(on ? "switchOff" : "switchOn"),
        confirmTitle: t(on ? "switchOffTitle" : "switchOnTitle"),
        confirmResult: t(on ? "switchOffResult" : "switchOnResult"),
        switched: t(on ? "switchedOff" : "switchedOn"),
      }}
    />
  );
}

function StepBlock({
  step,
  on,
  waiting,
  run,
  note = null,
  texts,
}: {
  step: "principal" | "finance";
  on: boolean;
  waiting: readonly FinanceStepWaiting[];
  run: typeof switchFinanceStepAction | typeof switchPrincipalStepAction;
  /** A line of its own under the hint: the Finance step's price rule (06 rule 8). */
  note?: string | null;
  texts: StepTexts;
}) {
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(run);
  const [open, setOpen] = useState(false);
  const data = (part: string) => ({
    [`data-${step}-step${part}`]: part === "" ? (on ? "on" : "off") : "",
  });

  async function confirm() {
    try {
      const result = await action.run({ on: !on });
      if (!result) return;
      if (!result.ok) {
        const numbers = result.error.available?.orders;
        const field = result.error.fields?.orders;
        toast.error(numbers ? texts.refused(numbers) : tAll(field ?? result.error.messageKey));
        router.refresh();
        return;
      }
      toast.success(texts.switched);
      router.refresh();
    } finally {
      setOpen(false);
    }
  }

  return (
    <section
      aria-labelledby={`${step}-step-title`}
      {...data("")}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id={`${step}-step-title`} className="text-subheading font-semibold">
        {texts.title}
      </h2>
      <p className="text-sm leading-5">{texts.state}</p>
      <p className="text-sm leading-5 text-muted-foreground">{texts.hint}</p>
      {note ? (
        <p {...data("-price")} className="text-sm leading-5 font-semibold">
          {note}
        </p>
      ) : null}
      {waiting.length > 0 ? (
        <div className="flex flex-col gap-2" {...data("-waiting")}>
          <p className="text-sm leading-5 font-semibold">{texts.waiting}</p>
          <ul className="flex flex-col gap-1">
            {waiting.map((order) => (
              <li key={order.id} className="text-sm leading-5">
                <Link
                  href={`/orders/${order.id}`}
                  className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline sm:min-h-0"
                >
                  {order.number}
                </Link>{" "}
                <span className="text-muted-foreground">{texts.waitingLine(order)}</span>
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
        {texts.button}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={action.pending}
        onConfirm={confirm}
        text={{
          title: texts.confirmTitle,
          result: texts.confirmResult,
          confirm: texts.button,
        }}
      />
    </section>
  );
}
