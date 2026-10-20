"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";

import { addPriceAction } from "./actions";

// The form of a new price (build-plan 1.9; 04-catalogs.md rule 4: "the Head adds the new price
// with a short note"; 11-screens-and-ux.md rules 4, 6, 7). It carries one client key until it is
// saved (developer-rules.md rule 8). The server checks the price and the note; the form checks
// nothing a second time (CLAUDE.md rule 1).

const noSubscription = () => () => undefined;

type Values = { price: string; note: string };

export function PriceForm({ variantId }: { variantId: string }) {
  const t = useTranslations("prices");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(addPriceAction, { create: true });
  const { register, handleSubmit, reset, formState } = useForm<Values>({
    defaultValues: { price: "", note: "" },
  });
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const onSubmit = handleSubmit(async (current) => {
    const result = await action.run({ variantId, price: current.price, note: current.note });
    if (!result) return;
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      return;
    }
    toast.success(t("saved"));
    reset({ price: "", note: "" });
    router.refresh();
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !action.pending} />
      <h2 className="text-subheading font-semibold">{t("newPrice")}</h2>
      <div className="flex flex-col gap-1.5">
        <Field id="price-price" label={t("price")} error={action.fieldTexts.price}>
          <Input
            {...register("price")}
            inputMode="numeric"
            maxLength={24}
            autoComplete="off"
            className="tabular-nums sm:max-w-60"
            aria-describedby="price-price-hint"
          />
        </Field>
        <p id="price-price-hint" className="text-sm leading-5 text-muted-foreground">
          {t("newPriceHint")}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Field id="price-note" label={t("note")} error={action.fieldTexts.note}>
          <Input
            {...register("note")}
            maxLength={250}
            autoComplete="off"
            aria-describedby="price-note-hint"
          />
        </Field>
        <p id="price-note-hint" className="text-sm leading-5 text-muted-foreground">
          {t("noteHint")}
        </p>
      </div>
      {action.fieldTexts.variantId && (
        <p className="text-sm leading-5 text-destructive">{action.fieldTexts.variantId}</p>
      )}
      <Button
        type="submit"
        pending={action.pending}
        disabled={!hydrated}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("save")}
      </Button>
    </form>
  );
}
