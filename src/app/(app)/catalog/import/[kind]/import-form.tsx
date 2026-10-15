"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { newClientKey } from "@/components/client-key";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import {
  IMPORT_COLUMNS,
  type ImportError,
  type ImportKind,
  importErrorKey,
} from "@/domain/imports";
import type { ImportPreview } from "@/features/catalog/queries/imports";
import type { FieldErrorKind } from "@/server/action-result";

import { previewImportAction, saveImportAction } from "../actions";

// The import's form (build-plan 1.10; 04-catalogs.md rule 7: "a preview with errors per row and
// saves nothing unless every row is valid"; 11-screens-and-ux.md, smooth feel 4 and 7). Choosing a
// file shows its preview at once; Save is enabled only when the preview found no error, and the
// server checks every row again. One client key per chosen file, kept across retries, so a lost
// answer never imports twice (developer-rules.md rule 8). At phone width the errors read as plain
// lines above the table, which scrolls inside its panel.

function formOf(kind: ImportKind, file: File, clientKey?: string): FormData {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  if (clientKey) form.set("clientKey", clientKey);
  return form;
}

/** The field errors of a refused save, read back as the preview's errors. */
function errorsOf(fields: Record<string, string>): ImportError[] {
  return Object.entries(fields).map(([key, message]) => {
    const kind = message.replace("errors.field.", "") as ImportError["kind"];
    // A key without a row (the file, its name) is an error of the file as a whole.
    if (!key.includes(":")) return { row: 0, column: "file", kind };
    const [row, column] = key.split(":");
    return { row: Number(row), column: column as ImportError["column"], kind };
  });
}

type Chosen = { file: File; clientKey: string };

export function ImportForm({
  kind,
  columns,
  listHref,
}: {
  kind: ImportKind;
  /** The column titles, in the order of IMPORT_COLUMNS. */
  columns: string[];
  listHref: string;
}) {
  const t = useTranslations("imports");
  const tAll = useTranslations();
  const router = useRouter();
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);

  const previewCall = useCallback(
    (input: { file: File }) => previewImportAction(formOf(kind, input.file)),
    [kind],
  );
  const saveCall = useCallback(
    (input: { file: File; clientKey: string }) =>
      saveImportAction(formOf(kind, input.file, input.clientKey)),
    [kind],
  );
  const reading = useAction(previewCall);
  const saving = useAction(saveCall);

  const columnName = (column: ImportError["column"]) =>
    columns[(IMPORT_COLUMNS[kind] as readonly string[]).indexOf(column)] ?? "";
  const messageOf = (error: ImportError) =>
    tAll(`errors.field.${error.kind satisfies FieldErrorKind}`);

  async function choose(file: File | undefined) {
    setPreview(null);
    setErrors([]);
    if (!file) {
      setChosen(null);
      return;
    }
    setChosen({ file, clientKey: newClientKey() });
    const result = await reading.run({ file });
    if (!result) return;
    if (!result.ok) {
      if (result.error.fields) setErrors(errorsOf(result.error.fields));
      else toast.error(tAll(result.error.messageKey));
      return;
    }
    setPreview(result.data);
    setErrors(result.data.errors);
  }

  async function save() {
    if (!chosen) return;
    const result = await saving.run({ file: chosen.file, clientKey: chosen.clientKey });
    if (!result) return;
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      if (result.error.fields) setErrors(errorsOf(result.error.fields));
      return;
    }
    toast.success(t("saved", { rows: result.data.rows }));
    router.push(listHref);
    router.refresh();
  }

  const wrong = new Set(errors.map((error) => importErrorKey(error)));
  const fileErrors = errors.filter((error) => error.column === "file");
  const rowErrors = errors.filter((error) => error.column !== "file");
  const rows = preview?.rows ?? [];
  const canSave = preview !== null && errors.length === 0 && rows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="import-template"
        className="flex flex-col gap-3 rounded-xl bg-card p-6 text-card-foreground"
      >
        <h2 id="import-template" className="text-[17px] leading-6 font-bold">
          {t("templateHeading")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t(`templateText.${kind}`)}</p>
        <a
          href={`/catalog/import/${kind}/template`}
          download
          className={buttonVariants({
            variant: "secondary",
            className: "w-full sm:w-auto sm:self-start",
          })}
        >
          <Icon name="download" />
          {t("download")}
        </a>
      </section>

      <section
        aria-labelledby="import-file"
        className="flex flex-col gap-3 rounded-xl bg-card p-6 text-card-foreground"
      >
        <h2 id="import-file" className="text-[17px] leading-6 font-bold">
          {t("fileHeading")}
        </h2>
        <p id="import-file-hint" className="text-sm leading-5 text-muted-foreground">
          {t("fileText")}
        </p>
        {/* The browser's own file button writes its text in the browser's language: the input is
            hidden and this label, from the message files, opens it (CLAUDE.md rule 13). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            id="import-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby="import-file-hint"
            disabled={reading.pending || saving.pending}
            onChange={(event) => void choose(event.target.files?.[0])}
            className="peer sr-only"
          />
          <label
            htmlFor="import-file-input"
            className={buttonVariants({
              variant: "secondary",
              className:
                "w-full cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50 sm:w-auto",
            })}
          >
            <Icon name="description" />
            {t("chooseFile")}
          </label>
          {chosen && <span className="text-sm leading-5 break-all">{chosen.file.name}</span>}
        </div>
        {reading.pending && (
          <p role="status" className="text-sm leading-5 text-muted-foreground">
            {t("reading")}
          </p>
        )}
        {fileErrors.map((error) => (
          <p
            key="file"
            role="alert"
            className="flex items-start gap-1.5 text-sm leading-5 text-destructive"
          >
            <Icon name="error" />
            {messageOf(error)}
          </p>
        ))}
      </section>

      {preview !== null && fileErrors.length === 0 && (
        <section
          aria-labelledby="import-preview"
          className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground"
        >
          <div className="flex flex-col gap-1">
            <h2 id="import-preview" className="text-[17px] leading-6 font-bold">
              {t("previewHeading")}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground">
              {t("summary", { rows: rows.length, errors: rowErrors.length })}
            </p>
          </div>

          {rowErrors.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg bg-destructive-bg p-4">
              <p className="text-sm leading-5 font-semibold">{t("fixAndRetry")}</p>
              <ul className="flex flex-col gap-1 text-sm leading-5">
                {rowErrors.map((error) => (
                  <li
                    key={importErrorKey(error)}
                    className="flex items-start gap-1.5 text-destructive"
                  >
                    <Icon name="error" />
                    <span>
                      {t("errorLine", {
                        row: error.row,
                        column: columnName(error.column),
                        message: messageOf(error),
                      })}
                      {error.firstRow !== undefined && ` ${t("seeRow", { row: error.firstRow })}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm leading-5">
                <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-right">
                      {t("row")}
                    </th>
                    {columns.map((title) => (
                      <th key={title} scope="col" className="px-3 py-2">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.row} className="border-t">
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                        {row.row}
                      </td>
                      {row.texts.map((text, at) => {
                        const bad = wrong.has(`${row.row}:${IMPORT_COLUMNS[kind][at]}`);
                        return (
                          <td
                            key={at}
                            className={
                              bad
                                ? "bg-destructive-bg px-3 py-2 font-semibold text-destructive"
                                : "px-3 py-2"
                            }
                          >
                            {bad && <Icon name="error" className="mr-1 inline align-text-bottom" />}
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving.pending}
            className="w-full sm:w-auto sm:self-start"
          >
            {saving.pending ? t("saving") : t("save")}
          </Button>
        </section>
      )}
    </div>
  );
}
