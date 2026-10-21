"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { createDraftAction, listDraftChoicesAction } from "@/app/(app)/orders/actions";
import { newClientKey } from "@/components/client-key";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { Skeleton } from "@/components/skeleton";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFormatters } from "@/i18n/use-formatters";

// "One button adds it as a draft order for that branch (or raises the Manager's existing draft
// for it, section 5)" (09-warehouse.md, Low stock; plan of 5.10, decided item 8, with the review
// of the plan, correction 1). Shown on a Low item where the query offers it (`canAddDraft`:
// `request.create` in the branch); the drafts grid's own actions do the rest and ask again. A
// draft needs a department (05 Order), chosen from listDraftChoicesAction(), the branch inside its
// SQL; the quantity is typed, empty at first (a suggested quantity is stock planning, 6.x). The
// same department and subtype raise the user's never-submitted draft (05 Drafts 2), whose new
// quantity is shown. One client key per opened dialog, so a press repeated after a lost answer
// adds once (developer-rules.md rule 8).

type Department = { id: string; name: string };

export function AddToDraftButton({
  branchId,
  variantId,
  itemName,
  unitShortName,
}: {
  branchId: string;
  variantId: string;
  itemName: string;
  unitShortName: string;
}) {
  const t = useTranslations("warehouse.addToDraft");
  const tWhy = useTranslations("common.whyNot");
  const tAll = useTranslations();
  const format = useFormatters();
  const departmentId = useId();
  const quantityId = useId();
  const clientKey = useRef(newClientKey());
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [department, setDepartment] = useState("");
  const [quantity, setQuantity] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function open() {
    clientKey.current = newClientKey();
    setDepartments(null);
    setDepartment("");
    setQuantity("");
    setErrors({});
    setAsking(true);
    try {
      const answer = await listDraftChoicesAction({ branchId });
      if (answer.ok) {
        setDepartments(answer.data.departments);
        return;
      }
      toast.error(tAll(answer.error.messageKey));
      setAsking(false);
    } catch {
      toast.error(tAll("errors.network"));
      setAsking(false);
    }
  }

  async function run() {
    setPending(true);
    try {
      const answer = await createDraftAction({
        clientKey: clientKey.current,
        branchId,
        variantId,
        departmentId: department,
        quantity,
      });
      if (answer.ok) {
        toast.success(
          answer.data.merged
            ? t("merged", { quantity: `${format.quantity(answer.data.quantity)} ${unitShortName}` })
            : t("added"),
        );
        setAsking(false);
        return;
      }
      const fields = answer.error.fields ?? {};
      if (fields.quantity || fields.departmentId) {
        setErrors(
          Object.fromEntries(
            Object.entries(fields)
              .filter(([field]) => field === "quantity" || field === "departmentId")
              .map(([field, key]) => [field, tAll(key)]),
          ),
        );
        return;
      }
      toast.error(tAll(answer.error.messageKey));
      setAsking(false);
    } catch {
      toast.error(tAll("errors.network"));
      setAsking(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="max-sm:h-11"
        onClick={() => void open()}
        data-add-to-draft={variantId}
      >
        <Icon name="add" size={18} />
        {t("button")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={pending}
        confirmDisabled={departments === null || department === "" || quantity.trim() === ""}
        disabledReason={departments === null ? null : tWhy("fields")}
        text={{ title: t("title", { item: itemName }), result: t("result"), confirm: t("confirm") }}
        onConfirm={() => void run()}
      >
        {departments === null ? (
          <div className="mt-4 flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : departments.length === 0 ? (
          <p className="mt-4 text-sm leading-5 text-muted-foreground">{t("noDepartments")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <Field id={departmentId} label={t("department")} error={errors.departmentId}>
              <Select
                value={department}
                disabled={pending}
                data-draft-department
                onChange={(event) => {
                  setDepartment(event.target.value);
                  setErrors({});
                }}
              >
                <option value="">{t("chooseDepartment")}</option>
                {departments.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id={quantityId}
              label={t("quantity", { unit: unitShortName })}
              error={errors.quantity}
            >
              <Input
                value={quantity}
                inputMode="decimal"
                maxLength={40}
                disabled={pending}
                data-draft-quantity
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setErrors({});
                }}
              />
            </Field>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
