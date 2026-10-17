"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { recordPurchaseAction } from "@/app/(app)/orders/[id]/purchase/actions";
import { newClientKey } from "@/components/client-key";
import { uploadFile } from "@/components/files/upload";
import { toast } from "@/components/toast";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FIELD_CLASSES, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { quantityRefusal } from "@/domain/drafts";
import { FILE_MIMES } from "@/domain/files";
import { parseSomOrZero } from "@/domain/money";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import { type CommentReason, purchaseCommentNeeds, sameAsPlanned } from "@/domain/purchases";
import type { PurchaseForm } from "@/features/purchasing/queries/purchase-form";
import { useFormatters } from "@/i18n/use-formatters";

// The purchase form of one Open order (07-purchasing.md, Purchase record; 11-screens-and-ux.md,
// smooth feel 3: "built for one hand: one order or group row at a time, large buttons, 'Same as
// planned', and the camera for the receipt"; plan of 3.3). One column on a phone, the plan beside
// the form on a computer. Which fields need a comment is purchaseCommentNeeds() of the domain,
// the same function the server asks; the server checks every field again.

type Values = {
  purchasedOn: string;
  qty: string;
  unitPrice: string;
  paymentType: PaymentType;
  supplierId: string;
  extras: { extraCostTypeId: string; amount: string; paymentType: PaymentType }[];
  comment: string;
};

type Receipt = { id: string; name: string };

const RECEIPTS_MAX = 5;

const noSubscription = () => () => undefined;

/** The comment reasons of what is typed now; none while the quantity or the price is not valid. */
function reasonsOf(form: PurchaseForm, values: Values): CommentReason[] {
  const price = parseSomOrZero(values.unitPrice);
  if (price === null || quantityRefusal(values.qty, form.allowDecimal) !== null) return [];
  return purchaseCommentNeeds({
    qty: values.qty.trim(),
    unitPrice: price,
    paymentType: values.paymentType,
    plannedQty: form.plannedQty,
    plannedPrice: form.plannedPrice,
    plannedPaymentType: form.paymentType,
    received: form.received,
  });
}

export function PurchaseFormView({ form }: { form: PurchaseForm }) {
  const t = useTranslations("purchase.form");
  const tPayment = useTranslations("paymentTypes");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const action = useAction(recordPurchaseAction, { create: true });
  const { register, handleSubmit, control, setValue, reset, formState } = useForm<Values>({
    defaultValues: {
      purchasedOn: form.today,
      qty: "",
      unitPrice: "",
      paymentType: form.paymentType,
      supplierId: form.defaultSupplierId ?? "",
      extras: [],
      comment: "",
    },
  });
  const extras = useFieldArray({ control, name: "extras" });
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLInputElement>(null);
  // Before hydration a click would submit the plain HTML form and lose what was typed (1.1).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const values = useWatch({ control }) as Values;
  const reasons = reasonsOf(form, values);
  const errors = action.fieldTexts;
  const unit = form.unitShortName;
  const plannedText = `${format.quantity(form.plannedQty)} ${unit}`;
  const receivedText = `${format.quantity(form.received)} ${unit}`;
  const product = form.subtypeName ? `${form.productName} · ${form.subtypeName}` : form.productName;

  function fillPlanned() {
    const filled = sameAsPlanned(
      form.plannedQty,
      form.plannedPrice,
      form.plannedExtras.map((extra) => extra.amount),
      form.received,
    );
    setValue("qty", filled.qty, { shouldDirty: true });
    setValue("unitPrice", filled.unitPrice.toString(), { shouldDirty: true });
    extras.replace(
      filled.extras.length === 0
        ? []
        : form.plannedExtras.map((extra) => ({
            extraCostTypeId: extra.extraCostTypeId,
            amount: extra.amount.toString(),
            paymentType: form.paymentType,
          })),
    );
  }

  async function addReceipt(file: File | undefined, input: HTMLInputElement | null) {
    if (!file) return;
    setUploading(true);
    try {
      // A new key per chosen file: a second receipt is a new upload, a retry of one is not.
      const result = await uploadFile(file, "document", newClientKey());
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      setReceipts((list) => [...list, { id: result.data.id, name: file.name }]);
    } finally {
      setUploading(false);
      if (input) input.value = "";
    }
  }

  const onSubmit = handleSubmit(async (current) => {
    const result = await action.run({
      orders: [{ id: form.orderId, version: form.version }],
      purchasedOn: current.purchasedOn,
      qty: current.qty,
      unitPrice: current.unitPrice,
      paymentType: current.paymentType,
      supplierId: current.supplierId || null,
      extras: current.extras,
      receiptFileIds: receipts.map((receipt) => receipt.id),
      comment: current.comment,
    });
    if (!result) return;
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      return;
    }
    toast.success(t("saved"));
    reset(current);
    setReceipts([]);
    router.push(`/orders/${form.orderId}`);
  });

  const receiptNeeded = form.receiptRequiredForCash && values.paymentType === "CASH";
  const paymentOptions = PAYMENT_TYPES.map((type) => ({ value: type, label: tPayment(type) }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <UnsavedChangesGuard dirty={formState.isDirty || receipts.length > 0} />
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          {t("subtitle", { number: form.number, product })}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr] lg:items-start">
        <section
          aria-labelledby="purchase-plan"
          className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:p-6"
        >
          <h2 id="purchase-plan" className="text-[17px] leading-6 font-semibold">
            {t("plan")}
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-[15px] leading-[22px]">
            <dt className="text-muted-foreground">{t("plannedQty")}</dt>
            <dd data-planned-qty className="tabular-nums">
              {plannedText}
            </dd>
            <dt className="text-muted-foreground">{t("plannedPrice")}</dt>
            <dd className="tabular-nums">{format.money(form.plannedPrice)}</dd>
            <dt className="text-muted-foreground">{t("plannedExtras")}</dt>
            <dd className="tabular-nums">
              {form.plannedExtras.length === 0
                ? t("none")
                : form.plannedExtras
                    .map((extra) => `${extra.typeName}: ${format.money(extra.amount)}`)
                    .join(", ")}
            </dd>
            <dt className="text-muted-foreground">{t("plannedPayment")}</dt>
            <dd>{tPayment(form.paymentType)}</dd>
            <dt className="text-muted-foreground">{t(form.isService ? "used" : "received")}</dt>
            <dd data-received className="tabular-nums">
              {receivedText}
            </dd>
          </dl>
          <Button
            type="button"
            variant="secondary"
            icon="done_all"
            onClick={fillPlanned}
            className="h-12 w-full"
          >
            {t("sameAsPlanned")}
          </Button>
        </section>

        <form
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="purchase-date" label={t("date")} error={errors.purchasedOn}>
              <Input type="date" max={form.today} {...register("purchasedOn")} />
            </Field>
            <Field id="purchase-qty" label={t("qty", { unit })} error={errors.qty}>
              <Input inputMode={form.allowDecimal ? "decimal" : "numeric"} {...register("qty")} />
            </Field>
            <Field id="purchase-price" label={t("price")} error={errors.unitPrice}>
              <Input inputMode="numeric" {...register("unitPrice")} />
            </Field>
            <Field id="purchase-supplier" label={t("supplier")} error={errors.supplierId}>
              <Select {...register("supplierId")}>
                <option value="">{t("noSupplier")}</option>
                {form.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-5 font-semibold">{t("paymentType")}</span>
            <Segmented
              label={t("paymentType")}
              options={paymentOptions}
              value={values.paymentType}
              onValueChange={(type) => setValue("paymentType", type, { shouldDirty: true })}
              className="w-full sm:w-auto"
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm leading-5 font-semibold">{t("extras")}</legend>
            {extras.fields.map((field, index) => (
              <div
                key={field.id}
                data-extra-row
                className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_auto]"
              >
                <Field
                  id={`purchase-extra-type-${index}`}
                  label={t("extraType")}
                  error={errors[`extras.${index}.extraCostTypeId`]}
                >
                  <Select {...register(`extras.${index}.extraCostTypeId`)}>
                    <option value="">{t("pick")}</option>
                    {form.extraCostTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  id={`purchase-extra-amount-${index}`}
                  label={t("extraAmount")}
                  error={errors[`extras.${index}.amount`]}
                >
                  <Input inputMode="numeric" {...register(`extras.${index}.amount`)} />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  icon="close"
                  aria-label={t("removeExtra")}
                  onClick={() => extras.remove(index)}
                  className="self-end"
                />
                <div className="sm:col-span-3">
                  <Segmented
                    label={t("extraPayment")}
                    options={paymentOptions}
                    value={values.extras[index]?.paymentType ?? form.paymentType}
                    onValueChange={(type) =>
                      setValue(`extras.${index}.paymentType`, type, { shouldDirty: true })
                    }
                    className="w-full sm:w-auto"
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              icon="add"
              onClick={() =>
                extras.append({ extraCostTypeId: "", amount: "", paymentType: form.paymentType })
              }
              className="self-start max-sm:h-11 max-sm:w-full"
            >
              {t("addExtra")}
            </Button>
          </fieldset>

          <div className="flex flex-col gap-2">
            <span className="text-sm leading-5 font-semibold">
              {receiptNeeded ? t("receiptRequired") : t("receipt")}
            </span>
            {receipts.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    data-receipt
                    className="flex items-center justify-between gap-2 text-[15px]"
                  >
                    <span className="truncate">{receipt.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      icon="close"
                      aria-label={t("removeReceipt", { name: receipt.name })}
                      onClick={() =>
                        setReceipts((list) => list.filter((item) => item.id !== receipt.id))
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void addReceipt(event.target.files?.[0], camera.current)}
            />
            <input
              ref={chooser}
              type="file"
              accept={FILE_MIMES.join(",")}
              data-receipt-input
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void addReceipt(event.target.files?.[0], chooser.current)}
            />
            {receipts.length < RECEIPTS_MAX ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  icon="add_photo_alternate"
                  pending={uploading}
                  onClick={() => camera.current?.click()}
                  className="max-sm:h-11 max-sm:flex-1"
                >
                  {t("takePhoto")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon="description"
                  pending={uploading}
                  onClick={() => chooser.current?.click()}
                  className="max-sm:h-11 max-sm:flex-1"
                >
                  {t("chooseFile")}
                </Button>
              </div>
            ) : null}
            {errors.receiptFileIds ? (
              <p className="text-sm leading-5 text-destructive">{errors.receiptFileIds}</p>
            ) : null}
          </div>

          <Field
            id="purchase-comment"
            label={reasons.length > 0 ? t("commentRequired") : t("comment")}
            error={errors.comment}
          >
            <textarea
              id="purchase-comment"
              rows={3}
              maxLength={1000}
              aria-required={reasons.length > 0 || undefined}
              aria-invalid={errors.comment ? true : undefined}
              {...register("comment")}
              className={cn(FIELD_CLASSES, "min-h-24 py-2")}
            />
          </Field>
          {reasons.length > 0 ? (
            <ul data-comment-reasons className="flex flex-col text-sm leading-5 text-warning">
              {reasons.map((reason) => (
                <li key={reason}>{t(`reasons.${reason}`)}</li>
              ))}
            </ul>
          ) : null}

          {action.errorText && Object.keys(errors).length === 0 ? (
            <p role="alert" className="text-[15px] leading-[22px] text-destructive">
              {action.errorText}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href={`/orders/${form.orderId}`}
              className={cn(buttonVariants({ variant: "ghost" }), "max-sm:h-12")}
            >
              {t("back")}
            </Link>
            <Button
              type="submit"
              pending={action.pending}
              disabled={!hydrated || uploading}
              className="h-12 sm:h-10"
            >
              {t("save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
