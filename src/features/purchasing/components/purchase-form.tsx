"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";

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
import {
  type CommentReason,
  purchaseCommentNeeds,
  receiptNeeded,
  sameAsPlanned,
  splitGroupQuantity,
} from "@/domain/purchases";
import type { PurchaseForm, PurchaseFormOrder } from "@/features/purchasing/queries/purchase-form";
import { firstStepWithError } from "@/features/purchasing/components/purchase-steps";
import { useFormatters } from "@/i18n/use-formatters";

// The purchase form of one trip (07-purchasing.md, Purchase record; One trip, many orders;
// 11-screens-and-ux.md, smooth feel 3; plans of 3.3 and 3.4). Shared once: date, payment type,
// supplier, receipts. Per order: quantity, price, subtype bought (07 Substitution; plan of 3.6),
// extra costs, comment, and "Same as planned" (review of the plan of 3.4, correction 1). Orders of
// one subtype are a group row: one quantity, one price and one subtype bought for the group, split by splitGroupQuantity() of the domain into each order's
// quantity, which can be changed before saving (07 One trip 2); an order left with 0 gets no
// record. The Head with orders of several owners picks one (07 One trip; decided item 9). Which
// lines need a comment is purchaseCommentNeeds() of the domain, the same function the server
// asks; the server checks everything again. On a computer the shared fields sit beside the orders.
// At phone width (below `sm`) the form shows one step at a time (11 smooth feel 3; plan of 3.9): a
// step is one block, one order or one group row with its orders; the visit comes on the last step,
// under its block and above Save, and the Head's owner select above the steps (review of the plan
// of 3.9, correction 1). Hidden steps are hidden by CSS only, so every line stays in the form and
// is sent; the DOM order is the order on screen at both widths (11 rule 13).

type Extra = { extraCostTypeId: string; amount: string; paymentType: PaymentType };

type Line = {
  qty: string;
  unitPrice: string;
  /** The subtype bought, default the ordered one (07 Purchase record, Subtype bought). */
  variantId: string;
  extras: Extra[];
  comment: string;
  /** 07 Purchase record, "Give straight to requester"; offered only where the form says so. */
  giveToRequester: boolean;
};

type Values = {
  purchasedOn: string;
  paymentType: PaymentType;
  supplierId: string;
  /** One per order of the form, in the form's order. */
  lines: Line[];
};

type Receipt = { id: string; name: string };

const RECEIPTS_MAX = 5;

const noSubscription = () => () => undefined;

/** "0", "0.000", "0,0": a line the split left empty, which gets no record (3.2 decided item 5). */
function isZero(qty: string): boolean {
  return /^0*([.,]0*)?$/.test(qty.trim()) && qty.trim() !== "";
}

/** The comment reasons of one line as typed now; none while its quantity or price is not valid. */
function reasonsOf(
  order: PurchaseFormOrder,
  line: Line,
  paymentType: PaymentType,
): CommentReason[] {
  const price = parseSomOrZero(line.unitPrice);
  if (price === null || quantityRefusal(line.qty, order.allowDecimal) !== null) return [];
  return purchaseCommentNeeds({
    qty: line.qty.trim(),
    unitPrice: price,
    paymentType,
    plannedQty: order.plannedQty,
    plannedPrice: order.plannedPrice,
    plannedPaymentType: order.paymentType,
    variantId: line.variantId,
    plannedVariantId: order.variantId,
    received: order.received,
  });
}

/** The supplier the orders share while it is active (07 Supplier: "Default is the order's company"). */
function sharedSupplier(orders: readonly PurchaseFormOrder[]): string {
  const first = orders[0]?.companyId ?? null;
  return first !== null && orders.every((order) => order.companyId === first) ? first : "";
}

export function PurchaseFormView({
  form,
  backHref,
}: {
  form: PurchaseForm;
  /** Where "Back" and a saved trip lead: the order page for one order, the list for a trip. */
  backHref: string;
}) {
  const t = useTranslations("purchase.form");
  const tPayment = useTranslations("paymentTypes");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(recordPurchaseAction, { create: true });
  const [ownerId, setOwnerId] = useState(form.owners[0]!.id);
  const shown = form.orders
    .map((order, index) => ({ order, index }))
    .filter(({ order }) => order.ownerId === ownerId);
  const single = form.orders.length === 1;
  const { register, handleSubmit, control, setValue, reset, formState } = useForm<Values>({
    defaultValues: {
      purchasedOn: form.today,
      paymentType: shown[0]!.order.paymentType,
      supplierId: sharedSupplier(shown.map(({ order }) => order)),
      lines: form.orders.map((order) => ({
        qty: "",
        unitPrice: "",
        variantId: order.variantId,
        extras: [],
        comment: "",
        giveToRequester: false,
      })),
    },
  });
  const [groups, setGroups] = useState<Record<string, { qty: string; price: string }>>({});
  const [sent, setSent] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLInputElement>(null);
  /** The step shown at phone width: an index into `blocks` (plan of 3.9). */
  const [step, setStep] = useState(0);
  /** Counts the moves between steps; each move brings the new step's heading into focus. */
  const [moves, setMoves] = useState(0);
  const formElement = useRef<HTMLFormElement>(null);
  // Before hydration a click would submit the plain HTML form and lose what was typed (1.1).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const values = useWatch({ control }) as Values;
  const fieldTexts = action.fieldTexts;
  /** A line's field error: the server names lines by their place in what was sent. */
  const lineError = (orderId: string, field: string) => {
    const at = sent.indexOf(orderId);
    return at < 0 ? undefined : fieldTexts[`lines.${at}.${field}`];
  };
  const approvals = shown.map(({ order }) => order.approvedOn ?? form.today);
  const earliest = approvals.reduce((newest, day) => (day > newest ? day : newest));

  // The group rows of the owner shown: orders of one subtype, in the split's order (07 One trip 2).
  const blocks: { variantId: string; members: typeof shown }[] = [];
  for (const each of shown) {
    const block = blocks.find((found) => found.variantId === each.order.variantId);
    if (block) block.members.push(each);
    else blocks.push({ variantId: each.order.variantId, members: [each] });
  }

  const last = blocks.length - 1;
  const shownStep = Math.min(step, last);

  /** Another step at phone width: the form's top comes into view and its heading takes the focus. */
  function goTo(next: number) {
    setStep(next);
    setMoves((count) => count + 1);
  }

  useEffect(() => {
    if (moves === 0) return;
    const heading = formElement.current?.querySelector<HTMLElement>(
      `[data-step="${shownStep}"] [data-step-heading]`,
    );
    formElement.current?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [moves, shownStep]);

  function chooseOwner(id: string) {
    setOwnerId(id);
    setStep(0);
    const orders = form.orders.filter((order) => order.ownerId === id);
    setValue("paymentType", orders[0]!.paymentType);
    setValue("supplierId", sharedSupplier(orders));
  }

  function typeGroup(block: (typeof blocks)[number], qty: string, price: string) {
    setGroups((all) => ({ ...all, [block.variantId]: { qty, price } }));
    const first = block.members[0]!.order;
    if (qty.trim() !== "" && quantityRefusal(qty, first.allowDecimal) === null) {
      for (const part of splitGroupQuantity(
        qty.trim(),
        block.members.map(({ order }) => ({
          id: order.orderId,
          number: order.number,
          submittedAt: new Date(order.submittedAt),
          plannedQty: order.plannedQty,
          received: order.received,
        })),
      )) {
        const at = form.orders.findIndex((order) => order.orderId === part.id);
        setValue(`lines.${at}.qty`, part.qty, { shouldDirty: true });
      }
    }
    for (const { index } of block.members) {
      setValue(`lines.${index}.unitPrice`, price, { shouldDirty: true });
    }
  }

  /** The group's subtype bought sets every line of the block; each can still be changed (decided 7). */
  function pickGroupSubtype(block: (typeof blocks)[number], variantId: string) {
    for (const { index } of block.members) {
      setValue(`lines.${index}.variantId`, variantId, { shouldDirty: true });
    }
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

  const recorded = shown.filter(({ index }) => !isZero(values.lines[index]?.qty ?? ""));

  const onSubmit = handleSubmit(async (current) => {
    const lines = recorded.map(({ order, index }) => ({
      orderId: order.orderId,
      qty: current.lines[index]!.qty,
      unitPrice: current.lines[index]!.unitPrice,
      variantId: current.lines[index]!.variantId,
      extras: current.lines[index]!.extras,
      comment: current.lines[index]!.comment,
      giveToRequester: order.canGiveToRequester && current.lines[index]!.giveToRequester,
    }));
    setSent(lines.map((line) => line.orderId));
    const result = await action.run({
      orders: recorded.map(({ order }) => ({ id: order.orderId, version: order.version })),
      purchasedOn: current.purchasedOn,
      paymentType: current.paymentType,
      supplierId: current.supplierId || null,
      receiptFileIds: receipts.map((receipt) => receipt.id),
      lines,
    });
    if (!result) return;
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      const at = firstStepWithError(
        Object.keys(result.error.fields ?? {}),
        lines.map((line) => line.orderId),
        blocks.map((block) => block.members.map(({ order }) => order.orderId)),
        shownStep,
      );
      if (at !== shownStep) goTo(at);
      return;
    }
    toast.success(single ? t("saved") : t("savedTrip", { count: lines.length }));
    reset(current);
    setReceipts([]);
    router.push(backHref);
  });

  // The action asks the same rule (07 Receipt; edge case "No receipt photo"; plan of 4.10b).
  const receiptRequired = receiptNeeded(
    form.receiptRequiredForCash,
    values.paymentType,
    recorded.flatMap(({ index }) =>
      (values.lines[index]?.extras ?? []).map((extra) => extra.paymentType ?? values.paymentType),
    ),
  );
  const paymentOptions = PAYMENT_TYPES.map((type) => ({ value: type, label: tPayment(type) }));
  const firstOrder = shown[0]!.order;
  const subtitle = single
    ? t("subtitle", {
        number: firstOrder.number,
        product: firstOrder.subtypeName
          ? `${firstOrder.productName} · ${firstOrder.subtypeName}`
          : firstOrder.productName,
      })
    : t("subtitleTrip", { count: shown.length, branch: form.branchCode });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Not while saving, so the guard's history entry is gone before the form leaves (as the
          suggestion form does). */}
      <UnsavedChangesGuard dirty={(formState.isDirty || receipts.length > 0) && !action.pending} />
      <header className="flex flex-col gap-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {form.leftOut > 0 ? (
          <p data-left-out className="text-sm text-muted-foreground">
            {t("leftOut", { count: form.leftOut })}
          </p>
        ) : null}
      </header>

      {form.owners.length > 1 ? (
        <Field id="purchase-owner" label={t("owner")} className="sm:max-w-sm">
          <Select value={ownerId} onChange={(event) => chooseOwner(event.target.value)}>
            {form.owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <form
        ref={formElement}
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr] lg:items-start"
      >
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {blocks.map((block, at) => {
            const first = block.members[0]!.order;
            const product = first.subtypeName
              ? `${first.productName} · ${first.subtypeName}`
              : first.productName;
            const typed = groups[block.variantId] ?? { qty: "", price: "" };
            return (
              <section
                key={block.variantId}
                data-block={block.variantId}
                data-step={at}
                aria-label={product}
                className={cn("flex flex-col gap-4", at !== shownStep && "max-sm:hidden")}
              >
                {block.members.length > 1 ? (
                  <div
                    data-group
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
                  >
                    <h2
                      data-step-heading
                      tabIndex={-1}
                      className="text-subheading font-semibold outline-none"
                    >
                      {t("group", { product, count: block.members.length })}
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        id={`purchase-group-qty-${block.variantId}`}
                        label={t("groupQty", { unit: first.unitShortName })}
                      >
                        <Input
                          inputMode={first.allowDecimal ? "decimal" : "numeric"}
                          value={typed.qty}
                          onChange={(event) => typeGroup(block, event.target.value, typed.price)}
                        />
                      </Field>
                      <Field id={`purchase-group-price-${block.variantId}`} label={t("groupPrice")}>
                        <Input
                          inputMode="numeric"
                          value={typed.price}
                          onChange={(event) => typeGroup(block, typed.qty, event.target.value)}
                        />
                      </Field>
                    </div>
                    {first.subtypes.length > 1 ? (
                      <Field
                        id={`purchase-group-subtype-${block.variantId}`}
                        label={t("groupSubtype")}
                      >
                        <Select
                          defaultValue={first.variantId}
                          onChange={(event) => pickGroupSubtype(block, event.target.value)}
                        >
                          {first.subtypes.map((subtype) => (
                            <option key={subtype.id} value={subtype.id}>
                              {subtype.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}
                    <p className="text-sm leading-5 text-muted-foreground">{t("splitNote")}</p>
                  </div>
                ) : null}
                {block.members.map(({ order, index }) => (
                  <OrderLine
                    key={order.orderId}
                    order={order}
                    index={index}
                    single={single}
                    control={control}
                    register={register}
                    setValue={setValue}
                    line={values.lines[index]!}
                    paymentType={values.paymentType}
                    extraCostTypes={form.extraCostTypes}
                    errorOf={(field) => lineError(order.orderId, field)}
                  />
                ))}
              </section>
            );
          })}
        </div>

        {/* The visit: on the last step at phone width, the left column from lg (plan of 3.9). */}
        <section
          aria-labelledby="purchase-visit"
          className={cn(
            "flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6 lg:col-start-1 lg:row-span-2 lg:row-start-1",
            shownStep !== last && "max-sm:hidden",
          )}
        >
          <h2 id="purchase-visit" className="text-subheading font-semibold">
            {t("visit")}
          </h2>
          <Field id="purchase-date" label={t("date")} error={fieldTexts.purchasedOn}>
            <Input type="date" min={earliest} max={form.today} {...register("purchasedOn")} />
          </Field>
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
          <Field id="purchase-supplier" label={t("supplier")} error={fieldTexts.supplierId}>
            <Select {...register("supplierId")}>
              <option value="">{t("noSupplier")}</option>
              {form.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-sm leading-5 font-semibold">
              {receiptRequired ? t("receiptRequired") : t("receipt")}
            </span>
            {receipts.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    data-receipt
                    className="flex items-center justify-between gap-2 text-sm"
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
              data-receipt-camera
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
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  icon="add_photo_alternate"
                  pending={uploading}
                  onClick={() => camera.current?.click()}
                  className="max-sm:h-12 max-sm:w-full"
                >
                  {t("takePhoto")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon="description"
                  pending={uploading}
                  onClick={() => chooser.current?.click()}
                  className="max-sm:h-12 max-sm:w-full"
                >
                  {t("chooseFile")}
                </Button>
              </div>
            ) : null}
            {fieldTexts.receiptFileIds ? (
              <p className="text-sm leading-5 text-destructive">{fieldTexts.receiptFileIds}</p>
            ) : null}
          </div>
        </section>

        <div className="flex flex-col gap-4 lg:col-start-2">
          {/* Outside the steps, so a refusal of the whole trip is never on a hidden step. */}
          {(fieldTexts.orders ?? (action.errorText && Object.keys(fieldTexts).length === 0)) ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldTexts.orders ?? action.errorText}
            </p>
          ) : null}

          {blocks.length > 1 ? (
            <nav
              aria-label={t("steps")}
              data-step-bar
              className="flex items-center justify-between gap-3 sm:hidden"
            >
              {shownStep > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  icon="chevron_left"
                  onClick={() => goTo(shownStep - 1)}
                >
                  {t("previous")}
                </Button>
              ) : (
                <span />
              )}
              <span data-step-count className="text-sm tabular-nums">
                {t("step", { current: shownStep + 1, total: blocks.length })}
              </span>
              {shownStep < last ? (
                <Button type="button" size="lg" onClick={() => goTo(shownStep + 1)}>
                  {t("next")}
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href={backHref}
              className={cn(buttonVariants({ variant: "ghost" }), "max-sm:h-12")}
            >
              {single ? t("back") : t("backToList")}
            </Link>
            {/* At phone width only on the last step: the one primary button there (plan of 3.9). */}
            <Button
              type="submit"
              pending={action.pending}
              disabled={!hydrated || uploading || recorded.length === 0}
              className={cn("h-12 sm:h-10", shownStep !== last && "max-sm:hidden")}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

/** One order of the trip: its plan, "Same as planned", and its own fields (07 One trip 1). */
function OrderLine({
  order,
  index,
  single,
  control,
  register,
  setValue,
  line,
  paymentType,
  extraCostTypes,
  errorOf,
}: {
  order: PurchaseFormOrder;
  index: number;
  single: boolean;
  control: Control<Values>;
  register: UseFormRegister<Values>;
  setValue: UseFormSetValue<Values>;
  line: Line;
  paymentType: PaymentType;
  extraCostTypes: PurchaseForm["extraCostTypes"];
  errorOf: (field: string) => string | undefined;
}) {
  const t = useTranslations("purchase.form");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  const extras = useFieldArray({ control, name: `lines.${index}.extras` });
  const unit = order.unitShortName;
  const reasons = reasonsOf(order, line, paymentType);
  const empty = isZero(line.qty);
  const paymentOptions = PAYMENT_TYPES.map((type) => ({ value: type, label: tPayment(type) }));
  const id = (field: string) => `purchase-${field}-${order.orderId}`;

  function fillPlanned() {
    const filled = sameAsPlanned(
      order.plannedQty,
      order.plannedPrice,
      order.plannedExtras.map((extra) => extra.amount),
      order.received,
    );
    setValue(`lines.${index}.qty`, filled.qty, { shouldDirty: true });
    setValue(`lines.${index}.unitPrice`, filled.unitPrice.toString(), { shouldDirty: true });
    extras.replace(
      filled.extras.length === 0
        ? []
        : order.plannedExtras.map((extra) => ({
            extraCostTypeId: extra.extraCostTypeId,
            amount: extra.amount.toString(),
            paymentType: order.paymentType,
          })),
    );
  }

  return (
    <section
      data-line={order.orderId}
      aria-labelledby={id("title")}
      className={cn("flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6", empty && "opacity-70")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={id("title")}
          data-step-heading
          tabIndex={-1}
          className="text-subheading font-semibold outline-none"
        >
          {single ? t("plan") : order.number}
        </h2>
        {empty ? (
          <span data-no-record className="text-sm leading-5 text-muted-foreground">
            {t("noRecord")}
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("plannedQty")}</dt>
        <dd data-planned-qty className="tabular-nums">
          {format.quantity(order.plannedQty)} {unit}
        </dd>
        <dt className="text-muted-foreground">{t("plannedPrice")}</dt>
        <dd className="tabular-nums">{format.money(order.plannedPrice)}</dd>
        <dt className="text-muted-foreground">{t("plannedExtras")}</dt>
        <dd className="tabular-nums">
          {order.plannedExtras.length === 0
            ? t("none")
            : order.plannedExtras
                .map((extra) => `${extra.typeName}: ${format.money(extra.amount)}`)
                .join(", ")}
        </dd>
        <dt className="text-muted-foreground">{t("plannedPayment")}</dt>
        <dd>{tPayment(order.paymentType)}</dd>
        <dt className="text-muted-foreground">{t(order.isService ? "used" : "received")}</dt>
        <dd data-received className="tabular-nums">
          {format.quantity(order.received)} {unit}
        </dd>
      </dl>
      <Button
        type="button"
        variant="secondary"
        icon="done_all"
        onClick={fillPlanned}
        className="h-12 w-full sm:w-auto sm:self-start"
      >
        {t("sameAsPlanned")}
      </Button>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={id("qty")} label={t("qty", { unit })} error={errorOf("qty")}>
          <Input
            inputMode={order.allowDecimal ? "decimal" : "numeric"}
            {...register(`lines.${index}.qty`)}
          />
        </Field>
        <Field id={id("price")} label={t("price")} error={errorOf("unitPrice")}>
          <Input inputMode="numeric" {...register(`lines.${index}.unitPrice`)} />
        </Field>
        {order.subtypes.length > 1 ? (
          <Field
            id={id("subtype")}
            label={t("subtype")}
            error={errorOf("variantId")}
            className="sm:col-span-2"
          >
            <Select {...register(`lines.${index}.variantId`)}>
              {order.subtypes.map((subtype) => (
                <option key={subtype.id} value={subtype.id}>
                  {subtype.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm leading-5 font-semibold">{t("extras")}</legend>
        {extras.fields.map((field, at) => (
          <div
            key={field.id}
            data-extra-row
            className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_auto]"
          >
            <Field
              id={id(`extra-type-${at}`)}
              label={t("extraType")}
              error={errorOf(`extras.${at}.extraCostTypeId`)}
            >
              <Select {...register(`lines.${index}.extras.${at}.extraCostTypeId`)}>
                <option value="">{t("pick")}</option>
                {extraCostTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id={id(`extra-amount-${at}`)}
              label={t("extraAmount")}
              error={errorOf(`extras.${at}.amount`)}
            >
              <Input inputMode="numeric" {...register(`lines.${index}.extras.${at}.amount`)} />
            </Field>
            <Button
              type="button"
              variant="ghost"
              icon="close"
              aria-label={t("removeExtra")}
              onClick={() => extras.remove(at)}
              className="self-end"
            />
            <div className="sm:col-span-3">
              <Segmented
                label={t("extraPayment")}
                options={paymentOptions}
                value={line.extras[at]?.paymentType ?? paymentType}
                onValueChange={(type) =>
                  setValue(`lines.${index}.extras.${at}.paymentType`, type, { shouldDirty: true })
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
          onClick={() => extras.append({ extraCostTypeId: "", amount: "", paymentType })}
          className="self-start max-sm:h-11 max-sm:w-full"
        >
          {t("addExtra")}
        </Button>
      </fieldset>

      {order.canGiveToRequester ? (
        // 07 Purchase record: the items go straight to the order's department (plan of 5.4).
        <label className="flex min-h-11 items-start gap-3 rounded-lg bg-muted p-3 text-sm">
          <input
            type="checkbox"
            {...register(`lines.${index}.giveToRequester`)}
            className="mt-0.5 size-5 shrink-0 accent-foreground"
          />
          <span className="flex flex-col gap-0.5">
            {t("giveToRequester")}
            <span className="text-sm leading-5 text-muted-foreground">
              {t("giveToRequesterHint")}
            </span>
          </span>
        </label>
      ) : null}

      <Field
        id={id("comment")}
        label={reasons.length > 0 ? t("commentRequired") : t("comment")}
        error={errorOf("comment")}
      >
        <textarea
          id={id("comment")}
          rows={3}
          maxLength={1000}
          aria-required={reasons.length > 0 || undefined}
          aria-invalid={errorOf("comment") ? true : undefined}
          {...register(`lines.${index}.comment`)}
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
    </section>
  );
}
