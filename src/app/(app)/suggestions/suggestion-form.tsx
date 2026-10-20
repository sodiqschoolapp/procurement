"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";

import { newClientKey } from "@/components/client-key";
import { uploadFile } from "@/components/files/upload";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FIELD_CLASSES, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { cn } from "@/components/utils";
import { IMAGE_MIMES } from "@/domain/files";

import { suggestProductAction } from "./actions";

// The form of a product suggestion (04-catalogs.md rule 8: "name, measure, photo, note"; plan of
// 1.12, decision 5). One client key until it is sent (developer-rules.md rule 8). The photo goes to
// /files first, as a product's (1.7), and its id is sent with the form. The server checks every
// value; its field errors show under the fields. With one branch the branch is not asked.

const noSubscription = () => () => undefined;

type Values = {
  branchId: string;
  name: string;
  unitText: string;
  note: string;
  photoFileId: string;
};

export type SuggestionBranch = { id: string; code: string; name: string };

export function SuggestionForm({
  branches,
  defaultBranchId,
}: {
  branches: SuggestionBranch[];
  defaultBranchId: string;
}) {
  const t = useTranslations("suggestions");
  const tAll = useTranslations();
  const router = useRouter();
  const send = useAction(suggestProductAction, { create: true });
  const { register, handleSubmit, reset, setValue, control, formState } = useForm<Values>({
    defaultValues: { branchId: defaultBranchId, name: "", unitText: "", note: "", photoFileId: "" },
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
    const result = await send.run(current);
    if (!result) return;
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      return;
    }
    toast.success(t("sent"));
    reset(current);
    router.push(`/suggestions/${result.data.id}`);
  });

  const hint = (id: string, text: string) => (
    <p id={id} className="text-sm leading-5 text-muted-foreground">
      {text}
    </p>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !send.pending} />
      {branches.length > 1 ? (
        <Field
          id="suggestion-branchId"
          label={t("fields.branchId")}
          error={send.fieldTexts.branchId}
        >
          <Select {...register("branchId")} className="sm:max-w-96">
            <option value="">{t("chooseBranch")}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {t("oneBranch", { code: branch.code, name: branch.name })}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" {...register("branchId")} />
      )}

      <div className="flex flex-col gap-1.5">
        <Field id="suggestion-name" label={t("fields.name")} error={send.fieldTexts.name}>
          <Input
            {...register("name")}
            maxLength={200}
            autoComplete="off"
            aria-describedby="suggestion-name-hint"
          />
        </Field>
        {hint("suggestion-name-hint", t("hints.name"))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Field
          id="suggestion-unitText"
          label={t("fields.unitText")}
          error={send.fieldTexts.unitText}
        >
          <Input
            {...register("unitText")}
            maxLength={60}
            autoComplete="off"
            className="sm:max-w-60"
            aria-describedby="suggestion-unitText-hint"
          />
        </Field>
        {hint("suggestion-unitText-hint", t("hints.unitText"))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm leading-5 font-semibold">{t("fields.photoFileId")}</span>
        <div className="flex flex-wrap items-center gap-3">
          {photoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
            <img
              src={`/files/${photoFileId}/small`}
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
            id="suggestion-photo"
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
            {tAll(
              uploading
                ? "catalog.photoUploading"
                : photoFileId
                  ? "catalog.photoReplace"
                  : "catalog.photoAdd",
            )}
          </Button>
          {photoFileId && !uploading && (
            <Button
              type="button"
              variant="ghost"
              icon="close"
              onClick={() => setValue("photoFileId", "", { shouldDirty: true })}
              className="w-full sm:w-auto"
            >
              {tAll("catalog.photoRemove")}
            </Button>
          )}
        </div>
        {send.fieldTexts.photoFileId && (
          <p className="text-sm leading-5 text-destructive">{send.fieldTexts.photoFileId}</p>
        )}
        {hint("suggestion-photo-hint", t("hints.photoFileId"))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Field id="suggestion-note" label={t("fields.note")} error={send.fieldTexts.note}>
          <textarea
            id="suggestion-note"
            {...register("note")}
            rows={4}
            maxLength={600}
            className={cn(FIELD_CLASSES, "min-h-24 py-2")}
            aria-describedby="suggestion-note-hint"
          />
        </Field>
        {hint("suggestion-note-hint", t("hints.note"))}
      </div>

      <Button
        type="submit"
        pending={send.pending}
        disabled={!hydrated || uploading}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("send")}
      </Button>
    </form>
  );
}
