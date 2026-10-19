"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FIELD_CLASSES } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { cn } from "@/components/utils";
import {
  CATALOG_ENTRIES,
  COMPANY_KINDS,
  type CatalogField,
  type EntryKind,
} from "@/domain/catalogs";

import { createCatalogEntryAction, updateCatalogEntryAction } from "./actions";
import { createDepartmentAction, updateDepartmentAction } from "./departments/actions";

// The one form of the four catalogs (build-plan 1.5: "built on one shared catalog component"),
// drawn from the catalog's fields in CATALOGS (11-screens-and-ux.md rules 4, 6, 7 and 13). A new
// entry carries one client key until it is saved (rule 7; developer-rules.md rule 8); an edit
// sends only the fields the Head changed (plan of 1.5, decision 8). The server checks every value
// and its field errors show under the fields; the form checks nothing a second time (CLAUDE.md
// rule 1). An empty optional field is sent empty and stored as null (decision 5). Departments
// (1.6) use it too, with their own actions and a branch chosen once, on a new department only
// (plan of 1.6, decision 1).

const noSubscription = () => () => undefined;

type Values = Record<string, string | boolean>;
type Entry = { id: string } & Record<string, string | boolean | null>;

/** What the form holds for an entry: null as an empty text. */
function valuesOf(fields: readonly CatalogField[], entry: Entry | null): Values {
  return Object.fromEntries(
    fields.map((field) => {
      const value = entry?.[field.key] ?? null;
      if (field.type === "boolean") return [field.key, value === true];
      return [field.key, typeof value === "string" ? value : ""];
    }),
  );
}

const MAX_LENGTH: Record<CatalogField["type"], number> = {
  text: 200,
  short: 40,
  long: 1200,
  boolean: 0,
  companyKind: 0,
  // Product fields (1.7) are drawn by the product form, never here.
  productType: 0,
  reference: 0,
  money: 0,
  photo: 0,
};

/** A branch a new department can be added to: the active ones (plan of 1.6, decision 3). */
export type BranchOption = { id: string; code: string; name: string };

export function CatalogForm({
  kind,
  entry,
  branches = [],
}: {
  kind: EntryKind;
  entry: Entry | null;
  branches?: readonly BranchOption[];
}) {
  const t = useTranslations("catalog");
  const tAll = useTranslations();
  const router = useRouter();
  const department = kind === "departments";
  const create = useAction(department ? createDepartmentAction : createCatalogEntryAction, {
    create: true,
  });
  const update = useAction(department ? updateDepartmentAction : updateCatalogEntryAction);
  const action = entry ? update : create;
  const fields: readonly CatalogField[] = CATALOG_ENTRIES[kind].fields;
  // A new department also has its branch, chosen once.
  const withBranch = department && !entry;
  const loaded: Values = { ...valuesOf(fields, entry), ...(withBranch ? { branchId: "" } : {}) };
  const { register, handleSubmit, reset, formState } = useForm<Values>({ defaultValues: loaded });
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

  const onSubmit = handleSubmit(async (current) => {
    if (!entry) {
      const result = await create.run(department ? current : { catalog: kind, ...current });
      if (!result) return;
      if (!result.ok) {
        toast.error(tAll(result.error.messageKey));
        return;
      }
      toast.success(t("created"));
      reset(current);
      router.push(`/catalog/${kind}/${result.data.id}`);
      return;
    }
    const sent: Values = department ? { id: entry.id } : { catalog: kind, id: entry.id };
    for (const field of fields) {
      if (current[field.key] !== loaded[field.key]) sent[field.key] = current[field.key]!;
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

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl bg-card p-6 text-card-foreground"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !action.pending} />
      {withBranch && (
        <div className="flex flex-col gap-1.5">
          <Field
            id="catalog-branchId"
            label={t("fields.branch")}
            error={action.fieldTexts.branchId}
          >
            <Select
              {...register("branchId")}
              aria-describedby="catalog-branchId-hint"
              className="sm:max-w-80"
            >
              <option value="">{t("chooseBranch")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {t("branchOption", { code: branch.code, name: branch.name })}
                </option>
              ))}
            </Select>
          </Field>
          <p id="catalog-branchId-hint" className="text-sm leading-5 text-muted-foreground">
            {t("hints.branch")}
          </p>
        </div>
      )}
      {fields.map((field) => {
        const id = `catalog-${field.key}`;
        const error = action.fieldTexts[field.key];
        const hint = hintKey(field.key);
        const hintId = `${id}-hint`;
        if (field.type === "boolean") {
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="flex items-start gap-3 text-[15px] leading-[22px] font-semibold">
                <input
                  type="checkbox"
                  {...register(field.key)}
                  aria-describedby={hint ? hintId : undefined}
                  className="mt-0.5 size-5 shrink-0 accent-foreground"
                />
                {t(`fields.${field.key}`)}
              </label>
              {hint && (
                <p id={hintId} className="pl-8 text-sm leading-5 text-muted-foreground">
                  {t(hint)}
                </p>
              )}
            </div>
          );
        }
        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Field id={id} label={t(`fields.${field.key}`)} error={error}>
              {field.type === "companyKind" ? (
                <Select {...register(field.key)} className="sm:max-w-80">
                  <option value="">{t("companyKind.choose")}</option>
                  {COMPANY_KINDS.map((value) => (
                    <option key={value} value={value}>
                      {t(`companyKind.${value}`)}
                    </option>
                  ))}
                </Select>
              ) : field.type === "long" ? (
                <textarea
                  id={id}
                  {...register(field.key)}
                  rows={4}
                  maxLength={MAX_LENGTH.long}
                  aria-describedby={hint ? hintId : undefined}
                  className={cn(FIELD_CLASSES, "min-h-24 py-2")}
                />
              ) : (
                <Input
                  {...register(field.key)}
                  maxLength={MAX_LENGTH[field.type]}
                  autoComplete="off"
                  inputMode={
                    field.key === "taxId"
                      ? "numeric"
                      : field.key === "phone" || field.key === "responsiblePhone"
                        ? "tel"
                        : undefined
                  }
                  className={field.type === "short" ? "sm:max-w-80" : undefined}
                  aria-describedby={hint ? (error ? `${id}-error ${hintId}` : hintId) : undefined}
                />
              )}
            </Field>
            {hint && (
              <p id={hintId} className="text-sm leading-5 text-muted-foreground">
                {t(hint)}
              </p>
            )}
          </div>
        );
      })}
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

const HINTS = [
  "shortName",
  "allowDecimal",
  "taxId",
  "phone",
  "note",
  "responsibleName",
  "responsiblePhone",
] as const;

function hintKey(key: string): `hints.${(typeof HINTS)[number]}` | null {
  return (HINTS as readonly string[]).includes(key)
    ? (`hints.${key}` as `hints.${(typeof HINTS)[number]}`)
    : null;
}
