"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { createDraftAction } from "@/app/(app)/orders/actions";
import { createRetryWaits, retryWhileLost } from "@/components/retry-wait";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import type { WireCreated } from "@/features/orders/draft-wire";
import { useFormatters } from "@/i18n/use-formatters";

import { useGrid } from "./grid-context";
import { type PickedSubtype, ProductPicker, Thumb } from "./product-picker";

// The add row at the foot of the drafts grid (05-order-request-form.md, Drafts 1 and 2; fields 1,
// 2, 3, 7, 10; plan of 2.5b, decided items 7 and 8). "Add" needs branch, product (its subtype
// picked with it), department and quantity; the server prefills price and payment type. One
// client key is made per add and kept until the answer arrives, and a second click while one is
// pending sends nothing (developer-rules.md rule 8; 11 rules 4 and 7; review of the plan,
// correction 3). A merged add says "Added to your draft: now 20" (05 Drafts 2).
//
// Plan of 2.6: the add row is the grid's last row (11 rule 2, decided item 2). Enter on a picked
// product moves to "Department"; Enter on "Department" or "Quantity" adds when the row is complete,
// else goes to the first empty field; after an add the focus is back on the product cell. An add
// that gets no answer is sent again with the same input and key until an answer comes (decided
// items 9 and 11): the fields are locked and "Add" stays pending meanwhile, and the grid holds its
// refreshes and deletes (onBusy; decided item 1, Look first).

export function AddDraftRow({
  defaultBranchId,
  onAdded,
  onBusy,
}: {
  /** The top bar's branch when it is active and a draft may be added there, else null. */
  defaultBranchId: string | null;
  onAdded(created: WireCreated): void;
  /** True from the first try of an add until its answer, retries included. */
  onBusy?(busy: boolean): void;
}) {
  const t = useTranslations("orders");
  const format = useFormatters();
  const grid = useGrid();
  const creatable = grid.branches.filter((branch) => branch.canCreate && branch.isActive);
  const fixed = defaultBranchId ?? (creatable.length === 1 ? creatable[0]!.id : null);
  const [branchId, setBranchId] = useState<string | null>(fixed);
  const [picked, setPicked] = useState<PickedSubtype | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const add = useAction(createDraftAction, { create: true });
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const busyNow = useRef(false);

  useEffect(() => {
    if (branchId) void grid.loadChoices(branchId);
  }, [branchId, grid]);

  const departments = branchId ? (grid.choices[branchId]?.departments ?? []) : [];
  const ready = Boolean(branchId && picked && departmentId && quantity.trim());

  /** The first empty field of the add row, in the order Tab reaches them. */
  function firstEmpty(): string | null {
    if (!branchId) return "add-branch";
    if (!picked) return "add-product";
    if (!departmentId) return "add-department";
    if (!quantity.trim()) return "add-quantity";
    return null;
  }

  function focus(id: string) {
    // After a re-render: a locked fieldset gives up the focus while it is disabled.
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busyNow.current) return;
    if (!ready) {
      const empty = firstEmpty();
      if (empty) focus(empty);
      return;
    }
    const input = { branchId: branchId!, variantId: picked!.subtype.id, departmentId, quantity };
    busyNow.current = true;
    setBusy(true);
    onBusy?.(true);
    let result: Awaited<ReturnType<typeof add.run>>;
    try {
      // The same input every try; useAction keeps the client key until a success (rule 8).
      result = await retryWhileLost(() => add.run(input), createRetryWaits(), setRetrying);
    } finally {
      busyNow.current = false;
      setBusy(false);
      onBusy?.(false);
    }
    if (!result?.ok) {
      const wrong = Object.keys(result && !result.ok ? (result.error.fields ?? {}) : {})[0];
      const ids: Record<string, string> = {
        branchId: "add-branch",
        variantId: "add-product",
        departmentId: "add-department",
        quantity: "add-quantity",
      };
      focus((wrong && ids[wrong]) || "add-quantity");
      return;
    }
    const created = result.data;
    if (created.merged) {
      toast.success(t("add.merged", { quantity: format.quantity(created.quantity) }));
    } else {
      toast.success(t("add.added"));
    }
    setPicked(null);
    setQuantity("");
    onAdded(created);
    focus("add-product");
  }

  const shown = picked
    ? picked.subtype.name
      ? `${picked.product.name} — ${picked.subtype.name}`
      : picked.product.name
    : "";

  return (
    <form
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        // Enter on "Department" adds too (a select does not submit a form by itself).
        if (event.key === "Enter" && (event.target as HTMLElement).tagName === "SELECT") {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
      aria-labelledby="add-draft-title"
      aria-busy={busy || undefined}
      className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6"
    >
      <h2 id="add-draft-title" className="text-[17px] leading-6 font-bold">
        {t("add.title")}
      </h2>
      <fieldset disabled={busy} className="flex min-w-0 flex-wrap items-start gap-3">
        {!fixed && (
          <Field
            id="add-branch"
            label={t("columns.branch")}
            className="w-full sm:w-40"
            error={add.fieldTexts.branchId}
          >
            <Select
              value={branchId ?? ""}
              onChange={(event) => {
                setBranchId(event.target.value || null);
                setPicked(null);
                setDepartmentId("");
              }}
            >
              <option value="">{t("columns.branch")}</option>
              {creatable.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          id="add-product"
          label={t("columns.product")}
          className="w-full sm:w-auto"
          error={add.fieldTexts.variantId}
        >
          <span className="flex items-start gap-2">
            <Thumb fileId={picked?.subtype.photoFileId ?? null} />
            <ProductPicker
              id="add-product"
              branchId={branchId}
              shown={shown}
              label={t("columns.product")}
              onPick={(hit) => {
                setPicked(hit);
                // Enter on a picked product moves on to "Department" (11 rule 2).
                focus("add-department");
              }}
            />
          </span>
        </Field>
        <Field
          id="add-department"
          label={t("columns.requestedBy")}
          className="w-full sm:w-56"
          error={add.fieldTexts.departmentId}
        >
          <Select
            value={departmentId}
            disabled={!branchId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">{t("pickDepartment")}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="add-quantity"
          label={t("columns.quantity")}
          className="w-full sm:w-32"
          error={add.fieldTexts.quantity}
        >
          <Input
            inputMode="decimal"
            value={quantity}
            className="text-right tabular-nums"
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
        <span className="flex w-full flex-col gap-1.5 sm:w-auto">
          <span aria-hidden="true" className="hidden h-5 sm:block" />
          <Button
            type="submit"
            icon="add"
            pending={busy}
            disabled={!ready}
            className="w-full sm:w-auto"
          >
            {t("add.button")}
          </Button>
        </span>
      </fieldset>
      {retrying && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("add.retrying")}
        </p>
      )}
      {picked && (
        <p className="text-[13px] leading-4 text-muted-foreground">
          {[
            picked.product.categoryName,
            picked.subtype.inStock === null
              ? t("picker.noStock")
              : t("picker.stock", {
                  stock: `${format.quantity(picked.subtype.inStock)} ${picked.product.unitShortName}`,
                }),
          ].join(" · ")}
        </p>
      )}
      {!busy && add.errorText && !Object.keys(add.fieldTexts).length && (
        <p className="text-sm text-destructive">
          {/* No answer after the retries: the same key goes with the next Add (decided item 9). */}
          {add.result && !add.result.ok && add.result.error.code === "network"
            ? t("add.notAdded")
            : add.errorText}
        </p>
      )}
    </form>
  );
}
