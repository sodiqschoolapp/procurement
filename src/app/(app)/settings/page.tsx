import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { storedSettingValue } from "@/domain/settings";
import {
  getFinanceStepWaiting,
  getLastDatabaseCopy,
  getSettingsForHead,
} from "@/features/settings/queries/settings";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { FinanceStepSwitch } from "./finance-step-switch";
import { OrderFieldsForm } from "./order-fields-form";
import { SettingsForm } from "./settings-form";

// /settings (11-screens-and-ux.md, Screens: "Settings, /settings, Head"; build-plan 1.1). The
// form and, below it, the change history of the settings (developer-rules.md rule 13). The query
// asks authorize(); a role without "Manage … settings" gets "not found", as an address of another
// branch does (03 rule 1; plan of 1.1, decision 12).

const FIELDS: Record<string, HistoryField> = {
  school_name: { label: "settings.schoolName", kind: "text" },
  school_year_start: { label: "settings.schoolYearStart", kind: "monthDay" },
  default_payment_type: { label: "settings.defaultPaymentType", kind: { enum: "paymentTypes" } },
  price_hint_percent: { label: "settings.priceHintPercent", kind: "percent" },
  overspend_guard_percent: { label: "settings.overspendGuard", kind: "percentOrOff" },
  overspend_guard_min_amount: { label: "settings.overspendGuardMinAmount", kind: "money" },
  receipt_required_for_cash: { label: "settings.receiptRequiredForCash", kind: "boolean" },
  reminder_hours: { label: "settings.reminderHours", kind: "hours" },
  escalation_hours: { label: "settings.escalationHours", kind: "hours" },
  finance_step: { label: "settings.financeStep.title", kind: "boolean" },
  order_fields: { label: "settings.orderFields.title", kind: "orderFields" },
};

async function readOrNotFound<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
}

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const t = await getTranslations();
  const values = await readOrNotFound(() => getSettingsForHead(user.id));
  const lastCopy = await readOrNotFound(() => getLastDatabaseCopy(user.id));
  const waiting = await readOrNotFound(() => getFinanceStepWaiting(user.id, !values.finance_step));
  const format = await getFormatters();
  const history = await listChangeHistory(user.id, { entity: "settings", entityId: "settings" });

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AdminNav current="settings" />
      <h1 className="text-title">{t("settings.title")}</h1>
      {/* 13-technology.md, Running it: "the Head's Settings page shows the date of the last copy". */}
      <p className="text-sm leading-5 text-muted-foreground" data-last-copy>
        {lastCopy ? t("settings.lastCopy", { date: format.date(lastCopy) }) : t("settings.noCopy")}
      </p>
      <SettingsForm
        values={{
          ...values,
          // Its decimal text: no bigint crosses to the browser (plan of 2.1).
          overspend_guard_min_amount: storedSettingValue(
            "overspend_guard_min_amount",
            values.overspend_guard_min_amount,
          ) as string,
        }}
      />
      <FinanceStepSwitch
        on={values.finance_step}
        waiting={waiting}
        priceRequired={values.order_fields.price.ask === "required"}
      />
      <OrderFieldsForm values={values.order_fields} financeStep={values.finance_step} />
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
        <h2 className="text-subheading font-semibold">{t("settings.history")}</h2>
        <ChangeHistory entries={history.rows} fields={FIELDS} />
      </section>
    </div>
  );
}
