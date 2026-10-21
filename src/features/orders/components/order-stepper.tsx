import { getTranslations } from "next-intl/server";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/components/utils";
import type { StepState, StepView } from "@/domain/order-steps";
import { getFormatters } from "@/i18n/get-formatters";

// The stepper of the order page (11-screens-and-ux.md, Order page layout 2: "Draft, Head,
// Principal, Finance, Open, Closed, with the name and time of each finished step"). The steps come
// from orderSteps() of src/domain/order-steps.ts; this only draws them. One row on a desktop, one
// step per line on a phone. The current step is blue, as its status dot; done steps navy.

const LOOK: Record<StepState, { icon: IconName | null; className: string }> = {
  done: { icon: "check_circle", className: "text-foreground" },
  current: { icon: "schedule", className: "text-info font-semibold" },
  stopped: { icon: "block", className: "text-muted-foreground font-semibold" },
  todo: { icon: null, className: "text-muted-foreground" },
};

export async function OrderStepper({ steps }: { steps: readonly StepView[] }) {
  const t = await getTranslations("orders.page.stepper");
  const format = await getFormatters();
  return (
    <section
      aria-labelledby="order-steps-title"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <h2 id="order-steps-title" className="sr-only">
        {t("title")}
      </h2>
      <ol className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        {steps.map((view) => {
          const look = LOOK[view.state];
          return (
            <li
              key={view.step}
              data-step={view.step}
              data-state={view.state}
              aria-current={view.state === "current" ? "step" : undefined}
              className={cn(
                "flex min-w-0 flex-1 items-start gap-2 sm:flex-col sm:border-t-2 sm:pt-3",
                view.state === "done" && "sm:border-foreground",
                view.state === "current" && "sm:border-info",
                (view.state === "todo" || view.state === "stopped") && "sm:border-border",
                look.className,
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
                {look.icon ? (
                  <Icon name={look.icon} size={20} />
                ) : (
                  <span className="size-3 rounded-full border-2 border-current" />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">
                  <span aria-hidden="true">{t(`steps.${view.step}`)}</span>
                  <span className="sr-only">
                    {t("line", { step: t(`steps.${view.step}`), state: t(`state.${view.state}`) })}
                  </span>
                </span>
                {view.by ? (
                  <span data-step-by className="text-small font-normal text-muted-foreground">
                    {t("by", {
                      name: view.by.name,
                      date: format.date(view.by.at),
                      time: format.time(view.by.at),
                    })}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
