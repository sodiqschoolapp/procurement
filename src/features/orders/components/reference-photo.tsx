"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { newClientKey } from "@/components/client-key";
import { uploadFile } from "@/components/files/upload";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { IMAGE_MIMES } from "@/domain/files";

// The one extra reference photo of a draft (05-order-request-form.md field 5: "The Manager may
// attach one extra reference photo"; plan of 2.5b, decided item 14). Shrunk in the browser and
// sent by the upload of 0.12, then saved on the draft as `referencePhotoFileId`, a held file
// (2.5a decided item 11). It opens in a new tab; "Remove" saves the draft without it.

export function ReferencePhoto({
  fileId,
  product,
  editable,
  onSave,
}: {
  fileId: string | null;
  product: string;
  editable: boolean;
  onSave(fileId: string | null): Promise<unknown>;
}) {
  const t = useTranslations("orders.reference");
  const tAll = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      // A new key per chosen file: a second photo is a new upload, a retry of one is not.
      const result = await uploadFile(file, "photo", newClientKey());
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      await onSave(result.data.id);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <span className="flex items-center gap-1">
      {fileId && (
        <a href={`/files/${fileId}/large`} target="_blank" rel="noreferrer" aria-label={t("open")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset */}
          <img
            src={`/files/${fileId}/small`}
            alt={t("alt", { name: product })}
            width={40}
            height={40}
            className="size-10 rounded-lg bg-muted object-cover"
          />
        </a>
      )}
      {editable && (
        <>
          <input
            ref={input}
            type="file"
            accept={IMAGE_MIMES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void choose(event.target.files?.[0])}
          />
          {fileId ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              icon="close"
              aria-label={t("remove")}
              onClick={() => void onSave(null)}
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              icon="add_photo_alternate"
              pending={uploading}
              aria-label={t(uploading ? "uploading" : "add")}
              onClick={() => input.current?.click()}
            />
          )}
        </>
      )}
    </span>
  );
}
