"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";

import { newClientKey } from "@/components/client-key";
import { uploadFile } from "@/components/files/upload";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { IMAGE_MIMES } from "@/domain/files";

import { createSubtypeAction, updateSubtypeAction } from "./[id]/subtypes/actions";

// The form of a subtype (build-plan 1.8; 04-catalogs.md, Catalogs table: "name, own photo
// (optional), own reference price (optional)"; 11-screens-and-ux.md rules 4, 6, 7 and 13). A new
// subtype carries one client key until it is saved (developer-rules.md rule 8); an edit sends only
// the fields the Head changed. The server checks every value; the form checks nothing a second
// time (CLAUDE.md rule 1). The price is typed on a new subtype only, and only when the product's
// hidden default holds none; otherwise it is shown as text (plan of 1.8, decision 2, Look first).
// Without its own photo the product's is shown (decision 8).

const noSubscription = () => () => undefined;

type Values = { name: string; referencePrice: string; photoFileId: string };

const EDITED = ["name", "photoFileId"] as const;

export type SubtypeEntry = { id: string; name: string; photoFileId: string | null };

export function SubtypeForm({
  productId,
  entry,
  price,
  priceLocked,
  productPhotoFileId,
}: {
  productId: string;
  entry: SubtypeEntry | null;
  /** The price shown as text, already formatted, or null when none is set. */
  price: string | null;
  /** A new subtype whose price is the default's held one: shown, not typed (decision 2). */
  priceLocked: boolean;
  productPhotoFileId: string | null;
}) {
  const t = useTranslations("catalog");
  const tAll = useTranslations();
  const router = useRouter();
  const create = useAction(createSubtypeAction, { create: true });
  const update = useAction(updateSubtypeAction);
  const action = entry ? update : create;
  const loaded: Values = {
    name: entry?.name ?? "",
    referencePrice: "",
    photoFileId: entry?.photoFileId ?? "",
  };
  const { register, handleSubmit, reset, setValue, control, formState } = useForm<Values>({
    defaultValues: loaded,
  });
  const photoFileId = useWatch({ control, name: "photoFileId" });
  const name = useWatch({ control, name: "name" });
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const loadedKey = JSON.stringify(loaded);
  useEffect(() => {
    reset(JSON.parse(loadedKey) as Values);
  }, [loadedKey, reset]);

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
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
    if (!entry) {
      const result = await create.run({
        productId,
        name: current.name,
        photoFileId: current.photoFileId,
        ...(priceLocked ? {} : { referencePrice: current.referencePrice }),
      });
      if (!result) return;
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      toast.success(t("created"));
      reset(current);
      router.push(`/catalog/products/${productId}`);
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

  const hint = (id: string, text: string) => (
    <p id={id} className="text-sm leading-5 text-muted-foreground">
      {text}
    </p>
  );
  const shownPhoto = photoFileId || productPhotoFileId;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !action.pending} />
      <Field id="subtype-name" label={t("fields.name")} error={action.fieldTexts.name}>
        <Input {...register("name")} maxLength={200} autoComplete="off" />
      </Field>

      <div className="flex flex-col gap-1.5">
        {entry || priceLocked ? (
          <>
            <span className="text-sm leading-5 font-semibold">{t("fields.referencePrice")}</span>
            <span className="text-sm tabular-nums">{price ?? t("noPrice")}</span>
            {action.fieldTexts.referencePrice && (
              <p className="text-sm leading-5 text-destructive">
                {action.fieldTexts.referencePrice}
              </p>
            )}
            {hint("subtype-referencePrice-hint", t("hints.referencePriceLater"))}
          </>
        ) : (
          <>
            <Field
              id="subtype-referencePrice"
              label={t("fields.referencePrice")}
              error={action.fieldTexts.referencePrice}
            >
              <Input
                {...register("referencePrice")}
                inputMode="numeric"
                maxLength={24}
                autoComplete="off"
                className="tabular-nums sm:max-w-60"
                aria-describedby="subtype-referencePrice-hint"
              />
            </Field>
            {hint("subtype-referencePrice-hint", t("hints.subtypePrice"))}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm leading-5 font-semibold">{t("fields.photoFileId")}</span>
        <div className="flex flex-wrap items-center gap-3">
          {shownPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
            <img
              src={`/files/${shownPhoto}/small`}
              alt={t("photoAlt", { name })}
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
            id="subtype-photo"
            type="file"
            aria-label={t("fields.photoFileId")}
            tabIndex={-1}
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
        {action.fieldTexts.productId && (
          <p className="text-sm leading-5 text-destructive">{action.fieldTexts.productId}</p>
        )}
        {hint("subtype-photo-hint", t("hints.subtypePhoto"))}
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
