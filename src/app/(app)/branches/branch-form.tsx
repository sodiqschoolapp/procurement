"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import type { BranchFields } from "@/domain/branches";

import { createBranchAction, updateBranchAction } from "./actions";

// The branch form of /branches/new and /branches/[id] (build-plan 1.2; 11-screens-and-ux.md rules
// 4, 6, 7 and 13). React Hook Form keeps what is typed; a new branch carries one client key until
// it is saved (rule 7; developer-rules.md rule 8); an edit sends only the fields the Head changed
// (plan of 1.2, decision 1). The server checks every value and its field errors show under the
// fields; the form checks nothing a second time (CLAUDE.md rule 1).

const noSubscription = () => () => undefined;

type Props = { branch: (BranchFields & { id: string; codeLocked?: boolean }) | null };

const EMPTY: BranchFields = { name: "", code: "", address: "" };

export function BranchForm({ branch }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const create = useAction(createBranchAction, { create: true });
  const update = useAction(updateBranchAction);
  const action = branch ? update : create;
  const loaded: BranchFields = branch
    ? { name: branch.name, code: branch.code, address: branch.address }
    : EMPTY;
  const { register, handleSubmit, reset, formState } = useForm<BranchFields>({
    defaultValues: loaded,
  });
  // Before hydration a click would submit the plain HTML form and lose what was typed (1.1).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  // A new page from the server (after a save) becomes the form's starting point.
  const loadedKey = JSON.stringify(loaded);
  useEffect(() => {
    reset(JSON.parse(loadedKey) as BranchFields);
  }, [loadedKey, reset]);

  const error = (field: keyof BranchFields) => action.fieldTexts[field];

  const onSubmit = handleSubmit(async (current) => {
    if (!branch) {
      const result = await create.run(current);
      if (!result) return;
      if (!result.ok) {
        toast.error(t(result.error.messageKey));
        return;
      }
      toast.success(t("branches.created"));
      reset(current);
      router.push(`/branches/${result.data.id}`);
      return;
    }
    const sent: Partial<BranchFields> & { id: string } = { id: branch.id };
    for (const field of ["name", "code", "address"] as const) {
      if (current[field] !== loaded[field]) sent[field] = current[field];
    }
    const result = await update.run(sent);
    if (!result) return;
    if (!result.ok) {
      toast.error(t(result.error.messageKey));
      return;
    }
    toast.success(t(result.data.changed.length > 0 ? "branches.saved" : "branches.nothingChanged"));
    reset(current);
    router.refresh();
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !action.pending} />
      <Field id="branch-name" label={t("branches.name")} error={error("name")}>
        <Input {...register("name")} maxLength={200} autoComplete="off" />
      </Field>
      <Field id="branch-code" label={t("branches.code")} error={error("code")}>
        <Input
          {...register("code")}
          maxLength={10}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="sm:max-w-40"
          // Locked after the branch's first numbered order (04, Branches; plan of 2.7, decided
          // item 8): read-only here, refused by the server and the database.
          readOnly={branch?.codeLocked === true}
          aria-describedby={
            error("code") ? "branch-code-error branch-code-hint" : "branch-code-hint"
          }
        />
      </Field>
      <p id="branch-code-hint" className="-mt-3 text-sm leading-5 text-muted-foreground">
        {t(branch?.codeLocked ? "branches.codeLocked" : "branches.codeHint")}
      </p>
      <Field id="branch-address" label={t("branches.address")} error={error("address")}>
        <Input {...register("address")} maxLength={400} autoComplete="off" />
      </Field>
      <Button
        type="submit"
        pending={action.pending}
        disabled={!hydrated}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("branches.save")}
      </Button>
    </form>
  );
}
