"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Controller, useForm } from "react-hook-form";

import { newClientKey } from "@/components/client-key";
import { uploadFile } from "@/components/files/upload";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FIELD_CLASSES, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { cn } from "@/components/utils";
import { IMAGE_MIMES } from "@/domain/files";
import { DEFAULT_PRODUCT_TYPE, PRODUCT_TYPES, type ProductType } from "@/domain/products";

import { addSuggestedProductAction } from "../../suggestions/actions";
import { createProductAction, updateProductAction } from "./actions";

// The form of a product or service (build-plan 1.7; 11-screens-and-ux.md rules 4, 6, 7 and 13).
// Its own form, as its selects, photo and price do not fit the shared catalog form (plan of 1.7,
// decision 14). A new item carries one client key until it is saved (rule 7; developer-rules.md
// rule 8); an edit sends only the fields the Head changed. The server checks every value and its
// field errors show under the fields; the form checks nothing a second time (CLAUDE.md rule 1).
// The reference price is typed on a new item only and shown as text on an edit (decision 2). A
// locked type or measure is shown disabled (decision 1). The photo is sent to /files first
// (src/components/files/upload.ts) and its id saved with the form. From a product suggestion
// (1.12) the form starts with the suggestion's name and photo, shows the measure asked for above
// the measure picker, and saves through the add, which also marks the suggestion added.

const noSubscription = () => () => undefined;

type Values = {
  name: string;
  type: ProductType;
  categoryId: string;
  unitId: string;
  defaultCompanyId: string;
  referencePrice: string;
  description: string;
  photoFileId: string;
};

const EDITED = [
  "name",
  "type",
  "categoryId",
  "unitId",
  "defaultCompanyId",
  "description",
  "photoFileId",
] as const;

export type ProductChoice = { id: string; name: string; isActive: boolean };

export type ProductEntry = {
  id: string;
  name: string;
  type: ProductType;
  categoryId: string;
  unitId: string;
  defaultCompanyId: string | null;
  description: string | null;
  photoFileId: string | null;
  inUse: boolean;
};

export type SuggestionStart = {
  id: string;
  name: string;
  unitText: string;
  photoFileId: string | null;
};

export function ProductForm({
  entry,
  choices,
  price,
  suggestion,
}: {
  entry: ProductEntry | null;
  /** A new product made from a product suggestion (plan of 1.12); never with `entry`. */
  suggestion?: SuggestionStart;
  choices: { categories: ProductChoice[]; units: ProductChoice[]; companies: ProductChoice[] };
  /** The reference price of an existing product, already formatted, or null when none is set. */
  price?: string | null;
}) {
  const t = useTranslations("catalog");
  const tAll = useTranslations();
  const router = useRouter();
  const create = useAction(createProductAction, { create: true });
  const update = useAction(updateProductAction);
  const add = useAction(addSuggestedProductAction, { create: true });
  const action = entry ? update : suggestion ? add : create;
  const loaded: Values = {
    name: entry?.name ?? suggestion?.name ?? "",
    type: entry?.type ?? DEFAULT_PRODUCT_TYPE,
    categoryId: entry?.categoryId ?? "",
    unitId: entry?.unitId ?? "",
    defaultCompanyId: entry?.defaultCompanyId ?? "",
    referencePrice: "",
    description: entry?.description ?? "",
    photoFileId: entry?.photoFileId ?? suggestion?.photoFileId ?? "",
  };
  const { register, handleSubmit, reset, control, setValue, watch, formState } = useForm<Values>({
    defaultValues: loaded,
  });
  const photoFileId = watch("photoFileId");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = entry?.inUse === true;
  // Before hydration a click would submit the plain HTML form and lose what was typed (1.1).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  // A new page from the server (after a save) becomes the form's starting point.
  const loadedKey = JSON.stringify(loaded);
  useEffect(() => {
    reset(JSON.parse(loadedKey) as Values);
  }, [loadedKey, reset]);

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      // A new key per chosen file: a second photo is a new upload, a retry of one is not.
      const result = await uploadFile(file, "photo", newClientKey());
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      setValue("photoFileId", result.data.id, { shouldDirty: true });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const onSubmit = handleSubmit(async (current) => {
    if (!entry && suggestion) {
      const result = await add.run({ ...current, suggestionId: suggestion.id });
      if (!result) return;
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      toast.success(tAll("suggestions.added"));
      reset(current);
      router.push(`/suggestions/${suggestion.id}`);
      return;
    }
    if (!entry) {
      const result = await create.run(current);
      if (!result) return;
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      toast.success(t("created"));
      reset(current);
      router.push(`/catalog/products/${result.data.id}`);
      return;
    }
    const sent: Partial<Values> & { id: string } = { id: entry.id };
    for (const key of EDITED) {
      if (current[key] !== loaded[key]) Object.assign(sent, { [key]: current[key] });
    }
    const result = await update.run(sent);
    if (!result) return;
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      return;
    }
    toast.success(t(result.data.changed.length > 0 ? "saved" : "nothingChanged"));
    reset(current);
    router.refresh();
  });

  const option = (choice: ProductChoice) => (
    <option key={choice.id} value={choice.id}>
      {choice.isActive ? choice.name : t("inactiveOption", { name: choice.name })}
    </option>
  );
  const hint = (id: string, text: string) => (
    <p id={id} className="text-sm leading-5 text-muted-foreground">
      {text}
    </p>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl bg-card p-6 text-card-foreground"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !action.pending} />
      <Field id="product-name" label={t("fields.name")} error={action.fieldTexts.name}>
        <Input {...register("name")} maxLength={200} autoComplete="off" />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm leading-5 font-semibold" aria-hidden>
          {t("fields.type")}
        </span>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Segmented
              label={t("fields.type")}
              options={PRODUCT_TYPES.map((value) => ({
                value,
                label: t(`productType.${value}`),
              }))}
              value={field.value}
              onValueChange={field.onChange}
              disabled={locked}
              className="w-full sm:w-auto sm:self-start"
            />
          )}
        />
        {action.fieldTexts.type && (
          <p className="text-sm leading-5 text-destructive">{action.fieldTexts.type}</p>
        )}
        {hint("product-type-hint", t(locked ? "hints.locked" : "hints.type"))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="product-categoryId"
          label={t("fields.categoryId")}
          error={action.fieldTexts.categoryId}
        >
          <Select {...register("categoryId")}>
            <option value="">{t("chooseCategory")}</option>
            {choices.categories.map(option)}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          {suggestion && (
            <p className="text-sm leading-5 font-semibold text-muted-foreground">
              {tAll("suggestions.askedMeasure", { unit: suggestion.unitText })}
            </p>
          )}
          <Field id="product-unitId" label={t("fields.unitId")} error={action.fieldTexts.unitId}>
            <Select {...register("unitId")} disabled={locked}>
              <option value="">{t("chooseUnit")}</option>
              {choices.units.map(option)}
            </Select>
          </Field>
          {locked && hint("product-unitId-hint", t("hints.locked"))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Field
          id="product-defaultCompanyId"
          label={t("fields.defaultCompanyId")}
          error={action.fieldTexts.defaultCompanyId}
        >
          <Select {...register("defaultCompanyId")} className="sm:max-w-96">
            <option value="">{t("noCompany")}</option>
            {choices.companies.map(option)}
          </Select>
        </Field>
        {hint("product-defaultCompanyId-hint", t("hints.defaultCompanyId"))}
      </div>

      <div className="flex flex-col gap-1.5">
        {entry ? (
          <>
            <span className="text-sm leading-5 font-semibold">{t("fields.referencePrice")}</span>
            <span className="text-[15px] leading-[22px] tabular-nums">{price ?? t("noPrice")}</span>
            {hint("product-referencePrice-hint", t("hints.referencePriceLater"))}
          </>
        ) : (
          <>
            <Field
              id="product-referencePrice"
              label={t("fields.referencePrice")}
              error={action.fieldTexts.referencePrice}
            >
              <Input
                {...register("referencePrice")}
                inputMode="numeric"
                maxLength={24}
                autoComplete="off"
                className="tabular-nums sm:max-w-60"
                aria-describedby="product-referencePrice-hint"
              />
            </Field>
            {hint("product-referencePrice-hint", t("hints.referencePrice"))}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Field
          id="product-description"
          label={t("fields.description")}
          error={action.fieldTexts.description}
        >
          <textarea
            {...register("description")}
            rows={4}
            maxLength={1200}
            className={cn(FIELD_CLASSES, "min-h-24 py-2")}
          />
        </Field>
        {hint("product-description-hint", t("hints.description"))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm leading-5 font-semibold">{t("fields.photoFileId")}</span>
        <div className="flex flex-wrap items-center gap-3">
          {photoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
            <img
              src={`/files/${photoFileId}/small`}
              alt={t("photoAlt", { name: watch("name") })}
              width={80}
              height={80}
              className="size-20 rounded-lg bg-muted object-cover"
            />
          ) : (
            <span className="flex size-20 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon name="inventory_2" size={24} />
              <span className="sr-only">{t("noPhoto")}</span>
            </span>
          )}
          <input
            ref={fileInput}
            id="product-photo"
            type="file"
            accept={IMAGE_MIMES.join(",")}
            className="sr-only"
            onChange={(event) => void choosePhoto(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            icon={photoFileId ? "edit" : "add"}
            pending={uploading}
            onClick={() => fileInput.current?.click()}
            className="w-full sm:w-auto"
          >
            {t(uploading ? "photoUploading" : photoFileId ? "photoReplace" : "photoAdd")}
          </Button>
          {photoFileId && !uploading && (
            <Button
              type="button"
              variant="ghost"
              icon="close"
              onClick={() => setValue("photoFileId", "", { shouldDirty: true })}
              className="w-full sm:w-auto"
            >
              {t("photoRemove")}
            </Button>
          )}
        </div>
        {action.fieldTexts.photoFileId && (
          <p className="text-sm leading-5 text-destructive">{action.fieldTexts.photoFileId}</p>
        )}
        {hint("product-photo-hint", t("hints.photoFileId"))}
      </div>

      <Button
        type="submit"
        pending={action.pending}
        disabled={!hydrated || uploading}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("save")}
      </Button>
    </form>
  );
}
