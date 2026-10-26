"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import {
  ASK_CHOICES,
  type Ask,
  ORDER_FIELDS,
  type OrderField,
  type OrderFields,
  PLACES,
  type Place,
  priceAskAllowed,
} from "@/domain/order-fields";

import { saveSettingsAction } from "./actions";

// The "Order fields" block of /settings (05-order-request-form.md, Fields the Head sets; D67; plan
// of 2.5d): for each field of 05's table, how it is asked and where it stands. The whole object is
// sent (decided item 3); the server checks it and writes the audit row (05 rule 4). The choices
// come from src/domain/order-fields.ts; the price offers Optional and Hidden only while the
// Finance step is off (06 Finance step switched off 8; plan of 2.5d-b), and the server checks it
// again under the settings lock. Branch, product, subtype and quantity are always asked and are not listed.

export function OrderFieldsForm({
  values,
  financeStep,
}: {
  values: OrderFields;
  /** The setting `finance_step` now: while it is on, the price is Required only. */
  financeStep: boolean;
}) {
  const choicesOf = (field: OrderField): readonly Ask[] =>
    ASK_CHOICES[field].filter((ask) =>
      field === "price" ? priceAskAllowed({ ...values, price: { ...values.price, ask } }, financeStep) : true,
    );
  const t = useTranslations("settings.orderFields");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(saveSettingsAction);
  const [fields, setFields] = useState<OrderFields>(values);
  const dirty = ORDER_FIELDS.some(
    (field) =>
      fields[field].ask !== values[field].ask || fields[field].place !== values[field].place,
  );

  function set(field: OrderField, change: Partial<{ ask: Ask; place: Place }>) {
    setFields((current) => ({ ...current, [field]: { ...current[field], ...change } }));
  }

  async function save() {
    const result = await action.run({ order_fields: fields });
    if (!result) return;
    if (!result.ok) {
      const price = result.error.fields?.["order_fields.price"];
      toast.error(tAll(price ?? result.error.messageKey));
      return;
    }
    toast.success(t("saved"));
    router.refresh();
  }

  return (
    <section
      aria-labelledby="order-fields-title"
      data-order-fields
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id="order-fields-title" className="text-subheading font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm leading-5 text-muted-foreground">{t("hint")}</p>
      {financeStep ? (
        <p data-price-hint className="text-sm leading-5 text-muted-foreground">
          {t("priceFinanceOn")}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border">
        {ORDER_FIELDS.map((field) => (
          <li
            key={field}
            data-order-field={field}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="text-sm leading-5 font-semibold sm:flex-1">{t(`field.${field}`)}</span>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Select
                aria-label={t("askLabel", { field: t(`field.${field}`) })}
                value={fields[field].ask}
                onChange={(event) => set(field, { ask: event.target.value as Ask })}
                data-ask
              >
                {choicesOf(field).map((ask) => (
                  <option key={ask} value={ask}>
                    {t(`ask.${ask}`)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={t("placeLabel", { field: t(`field.${field}`) })}
                value={fields[field].place}
                disabled={fields[field].ask === "hidden"}
                onChange={(event) => set(field, { place: event.target.value as Place })}
                data-place
              >
                {PLACES.map((place) => (
                  <option key={place} value={place}>
                    {t(`place.${place}`)}
                  </option>
                ))}
              </Select>
            </div>
          </li>
        ))}
      </ul>
      <Button
        onClick={save}
        disabled={!dirty || action.pending}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("save")}
      </Button>
    </section>
  );
}
