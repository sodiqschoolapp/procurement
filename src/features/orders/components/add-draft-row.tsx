"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { createDraftAction } from "@/app/(app)/orders/actions";
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

export function AddDraftRow({
  defaultBranchId,
  onAdded,
}: {
  /** The top bar's branch when it is active and a draft may be added there, else null. */
  defaultBranchId: string | null;
  onAdded(created: WireCreated): void;
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

  useEffect(() => {
    if (branchId) void grid.loadChoices(branchId);
  }, [branchId, grid]);

  const departments = branchId ? (grid.choices[branchId]?.departments ?? []) : [];
  const ready = Boolean(branchId && picked && departmentId && quantity.trim());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || add.pending) return;
    const result = await add.run({
      branchId: branchId!,
      variantId: picked!.subtype.id,
      departmentId,
      quantity,
    });
    if (!result?.ok) return;
    const created = result.data;
    if (created.merged) {
      toast.success(t("add.merged", { quantity: format.quantity(created.quantity) }));
    } else {
      toast.success(t("add.added"));
    }
    setPicked(null);
    setQuantity("");
    onAdded(created);
  }

  const shown = picked
    ? picked.subtype.name
      ? `${picked.product.name} — ${picked.subtype.name}`
      : picked.product.name
    : "";

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-labelledby="add-draft-title"
      className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6"
    >
      <h2 id="add-draft-title" className="text-[17px] leading-6 font-bold">
        {t("add.title")}
      </h2>
      <div className="flex flex-wrap items-start gap-3">
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
              onPick={setPicked}
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
            pending={add.pending}
            disabled={!ready}
            className="w-full sm:w-auto"
          >
            {t("add.button")}
          </Button>
        </span>
      </div>
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
      {add.errorText && !Object.keys(add.fieldTexts).length && (
        <p className="text-sm text-destructive">{add.errorText}</p>
      )}
    </form>
  );
}
