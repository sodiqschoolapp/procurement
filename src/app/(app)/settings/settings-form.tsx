"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import { GUARD_OFF, type SettingKey, type SettingValues, lastDayOf } from "@/domain/settings";

import { saveSettingsAction } from "./actions";

// The settings form (build-plan 1.1; 11-screens-and-ux.md rules 4, 6 and 13). React Hook Form
// keeps what is typed and knows which fields changed; only those keys are sent (plan of 1.1,
// decision 7). The server checks every value with Zod and its field errors are shown under the
// fields; the form checks nothing a second time (CLAUDE.md rule 1). The screen decides nothing:
// whether a key changed is decided again by the action.

type FormValues = {
  school_name: string;
  year_day: string;
  year_month: string;
  default_payment_type: PaymentType;
  price_hint_percent: string;
  guard: "on" | "off";
  guard_percent: string;
  guard_amount: string;
  receipt_required_for_cash: "yes" | "no";
  reminder_hours: string;
  escalation_hours: string;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

const noSubscription = () => () => undefined;

/**
 * The values the page hands the form: the overspend guard's amount as its decimal text, so no
 * bigint crosses to the browser (plan of 2.1, "Server actions and queries").
 */
export type SettingsFormValues = Omit<SettingValues, "overspend_guard_min_amount"> & {
  overspend_guard_min_amount: string;
};

/** The last percent the guard had, shown in its field when the guard is off. */
const FALLBACK_GUARD_PERCENT = "10";

function formValuesOf(values: SettingsFormValues): FormValues {
  const guard = values.overspend_guard_percent;
  return {
    school_name: values.school_name ?? "",
    year_day: values.school_year_start ? String(values.school_year_start.day) : "",
    year_month: values.school_year_start ? String(values.school_year_start.month) : "",
    default_payment_type: values.default_payment_type,
    price_hint_percent: String(values.price_hint_percent),
    guard: guard === GUARD_OFF ? "off" : "on",
    guard_percent: guard === GUARD_OFF ? FALLBACK_GUARD_PERCENT : String(guard),
    guard_amount: values.overspend_guard_min_amount,
    receipt_required_for_cash: values.receipt_required_for_cash ? "yes" : "no",
    reminder_hours: String(values.reminder_hours),
    escalation_hours: String(values.escalation_hours),
  };
}

/** A typed number as a number; anything else is sent as typed, and the server names the error. */
function numberOf(text: string): number | string {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : text;
}

/** What the form sends: the keys whose shown value differs from what the page loaded. */
function changesOf(form: FormValues, loaded: FormValues): Record<string, unknown> {
  const sent: Record<string, unknown> = {};
  if (form.school_name !== loaded.school_name) sent.school_name = form.school_name;
  if (form.year_day !== loaded.year_day || form.year_month !== loaded.year_month) {
    sent.school_year_start = {
      month: form.year_month === "" ? undefined : Number(form.year_month),
      day: form.year_day === "" ? undefined : Number(form.year_day),
    };
  }
  if (form.default_payment_type !== loaded.default_payment_type) {
    sent.default_payment_type = form.default_payment_type;
  }
  if (form.price_hint_percent !== loaded.price_hint_percent) {
    sent.price_hint_percent = numberOf(form.price_hint_percent);
  }
  const guardOf = (values: FormValues) =>
    values.guard === "off" ? GUARD_OFF : numberOf(values.guard_percent);
  if (guardOf(form) !== guardOf(loaded)) sent.overspend_guard_percent = guardOf(form);
  // Sent as typed: the server reads the so'm (CLAUDE.md rule 6; no number touches money here).
  // Only while the guard is on: the hidden field keeps its value (plan of 2.1, decision 2).
  if (form.guard === "on" && form.guard_amount !== loaded.guard_amount) {
    sent.overspend_guard_min_amount = form.guard_amount;
  }
  if (form.receipt_required_for_cash !== loaded.receipt_required_for_cash) {
    sent.receipt_required_for_cash = form.receipt_required_for_cash === "yes";
  }
  if (form.reminder_hours !== loaded.reminder_hours) {
    sent.reminder_hours = numberOf(form.reminder_hours);
  }
  if (form.escalation_hours !== loaded.escalation_hours) {
    sent.escalation_hours = numberOf(form.escalation_hours);
  }
  return sent;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-5 border-t pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full text-[17px] leading-6 font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** The hint, and the error line first when there is one (the Field's own id for it). */
function describedBy(id: string, hasError: boolean): string {
  return hasError ? `${id}-error ${id}-hint` : `${id}-hint`;
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-sm leading-5 text-muted-foreground">
      {children}
    </p>
  );
}

export function SettingsForm({ values }: { values: SettingsFormValues }) {
  const t = useTranslations();
  const router = useRouter();
  const action = useAction(saveSettingsAction);
  const loaded = formValuesOf(values);
  const form = useForm<FormValues>({ defaultValues: loaded });
  const { register, control, handleSubmit, reset, formState } = form;
  // Before hydration a click would submit the plain HTML form and reload the page, losing what
  // was typed: Save is enabled once the form runs in the browser (11 rule 7).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  // A new page from the server (after a save) becomes the form's starting point.
  const loadedKey = JSON.stringify(loaded);
  useEffect(() => {
    reset(JSON.parse(loadedKey) as FormValues);
  }, [loadedKey, reset]);

  const error = (key: SettingKey | `${SettingKey}.${string}`) => action.fieldTexts[key];
  const yearError =
    error("school_year_start") ??
    error("school_year_start.day") ??
    error("school_year_start.month");
  const month = Number(useWatch({ control, name: "year_month" }));
  const guardOn = useWatch({ control, name: "guard" }) === "on";

  const onSubmit = handleSubmit(async (current) => {
    const result = await action.run(changesOf(current, loaded));
    if (!result) return;
    if (!result.ok) {
      toast.error(t(result.error.messageKey));
      return;
    }
    toast.success(t(result.data.changed.length > 0 ? "settings.saved" : "settings.nothingChanged"));
    reset(current);
    router.refresh();
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6 rounded-xl bg-card p-6 text-card-foreground"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !action.pending} />

      <Group title={t("settings.school")}>
        <Field id="school_name" label={t("settings.schoolName")} error={error("school_name")}>
          <Input
            {...register("school_name")}
            maxLength={200}
            autoComplete="organization"
            aria-describedby={describedBy("school_name", Boolean(error("school_name")))}
          />
        </Field>
        <Hint id="school_name-hint">{t("settings.schoolNameHint")}</Hint>

        <div
          role="group"
          aria-labelledby="school_year_start-label"
          className="flex flex-col gap-1.5"
        >
          <p id="school_year_start-label" className="text-sm leading-5 font-semibold">
            {t("settings.schoolYearStart")}
          </p>
          <div className="grid grid-cols-[6rem_1fr] gap-3 sm:max-w-sm">
            <Field id="year_day" label={<span className="sr-only">{t("settings.day")}</span>}>
              <Select {...register("year_day")} aria-label={t("settings.day")}>
                <option value="">{t("settings.day")}</option>
                {DAYS.filter((day) => !month || day <= lastDayOf(month)).map((day) => (
                  <option key={day} value={String(day)}>
                    {day}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="year_month" label={<span className="sr-only">{t("settings.month")}</span>}>
              <Select {...register("year_month")} aria-label={t("settings.month")}>
                <option value="">{t("settings.month")}</option>
                {MONTHS.map((value) => (
                  <option key={value} value={String(value)}>
                    {t(`months.${value}` as "months.1")}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {yearError ? (
            <p className="text-sm leading-5 text-destructive">{yearError}</p>
          ) : (
            <Hint id="school_year_start-hint">{t("settings.schoolYearStartHint")}</Hint>
          )}
        </div>
      </Group>

      <Group title={t("settings.ordersAndMoney")}>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm leading-5 font-semibold">{t("settings.defaultPaymentType")}</p>
          <Controller
            control={control}
            name="default_payment_type"
            render={({ field }) => (
              <Segmented
                label={t("settings.defaultPaymentType")}
                value={field.value}
                onValueChange={field.onChange}
                options={PAYMENT_TYPES.map((type) => ({
                  value: type,
                  label: t(`paymentTypes.${type}`),
                }))}
                className="w-full sm:w-auto sm:self-start"
              />
            )}
          />
        </div>

        <Field
          id="price_hint_percent"
          label={t("settings.priceHintPercent")}
          error={error("price_hint_percent")}
        >
          <Input
            {...register("price_hint_percent")}
            inputMode="numeric"
            className="sm:max-w-40"
            aria-describedby={describedBy(
              "price_hint_percent",
              Boolean(error("price_hint_percent")),
            )}
          />
        </Field>
        <Hint id="price_hint_percent-hint">{t("settings.priceHintPercentHint")}</Hint>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm leading-5 font-semibold">{t("settings.overspendGuard")}</p>
          <Controller
            control={control}
            name="guard"
            render={({ field }) => (
              <Segmented
                label={t("settings.overspendGuard")}
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  { value: "on", label: t("settings.guardOn") },
                  { value: "off", label: t("settings.guardOff") },
                ]}
                className="w-full sm:w-auto sm:self-start"
              />
            )}
          />
        </div>
        {guardOn && (
          <Field
            id="guard_percent"
            label={t("settings.overspendGuardPercent")}
            error={error("overspend_guard_percent")}
          >
            <Input
              {...register("guard_percent")}
              inputMode="numeric"
              className="sm:max-w-40"
              aria-describedby={describedBy(
                "guard_percent",
                Boolean(error("overspend_guard_percent")),
              )}
            />
          </Field>
        )}
        {guardOn && (
          <Field
            id="guard_amount"
            label={t("settings.overspendGuardMinAmount")}
            error={error("overspend_guard_min_amount")}
          >
            <Input
              {...register("guard_amount")}
              inputMode="numeric"
              maxLength={24}
              autoComplete="off"
              className="tabular-nums sm:max-w-60"
              aria-describedby={
                error("overspend_guard_min_amount")
                  ? "guard_amount-error guard_percent-hint"
                  : "guard_percent-hint"
              }
            />
          </Field>
        )}
        <Hint id="guard_percent-hint">{t("settings.overspendGuardHint")}</Hint>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm leading-5 font-semibold">{t("settings.receiptRequiredForCash")}</p>
          <Controller
            control={control}
            name="receipt_required_for_cash"
            render={({ field }) => (
              <Segmented
                label={t("settings.receiptRequiredForCash")}
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  { value: "yes", label: t("settings.yes") },
                  { value: "no", label: t("settings.no") },
                ]}
                className="w-full sm:w-auto sm:self-start"
              />
            )}
          />
        </div>
      </Group>

      <Group title={t("settings.reminders")}>
        <Field
          id="reminder_hours"
          label={t("settings.reminderHours")}
          error={error("reminder_hours")}
        >
          <Input
            {...register("reminder_hours")}
            inputMode="numeric"
            className="sm:max-w-40"
            aria-describedby={describedBy("reminder_hours", Boolean(error("reminder_hours")))}
          />
        </Field>
        <Hint id="reminder_hours-hint">{t("settings.reminderHoursHint")}</Hint>
        <Field
          id="escalation_hours"
          label={t("settings.escalationHours")}
          error={error("escalation_hours")}
        >
          <Input
            {...register("escalation_hours")}
            inputMode="numeric"
            className="sm:max-w-40"
            aria-describedby={describedBy("escalation_hours", Boolean(error("escalation_hours")))}
          />
        </Field>
        <Hint id="escalation_hours-hint">{t("settings.escalationHoursHint")}</Hint>
      </Group>

      <Button
        type="submit"
        pending={action.pending}
        disabled={!hydrated}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("settings.save")}
      </Button>
    </form>
  );
}
