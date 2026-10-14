import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ChangeHistory, type HistoryField } from "@/components/change-history";
import { listChangeHistory } from "@/features/audit/queries/change-history";
import { getSettingsForHead } from "@/features/settings/queries/settings";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

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
  receipt_required_for_cash: { label: "settings.receiptRequiredForCash", kind: "boolean" },
  reminder_hours: { label: "settings.reminderHours", kind: "hours" },
  escalation_hours: { label: "settings.escalationHours", kind: "hours" },
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
  const history = await listChangeHistory(user.id, { entity: "settings", entityId: "settings" });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
        {t("settings.title")}
      </h1>
      <SettingsForm values={values} />
      <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
        <h2 className="text-[17px] leading-6 font-bold">{t("settings.history")}</h2>
        <ChangeHistory entries={history.rows} fields={FIELDS} />
      </section>
    </div>
  );
}
