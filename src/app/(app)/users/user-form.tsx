"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { generatePassword } from "@/domain/passwords";
import { ROLES, type Role } from "@/domain/permissions";
import type { BranchChoice, UserDetail } from "@/features/users/queries/users";
import { LOCALES } from "@/i18n/locale";

import { createUserAction, updateUserAction } from "./actions";
import { ShownPassword } from "./shown-password";

// The user form of /users/new and /users/[id] (build-plan 1.3; 11-screens-and-ux.md rules 4, 6,
// 7 and 13). React Hook Form keeps what is typed; a new user carries one client key until it is
// saved (developer-rules.md rule 8); an edit sends only the fields the Head changed (plan of 1.3,
// decision 13), and never the role (Look first 1). The server checks every value and its field
// errors show under the fields; the form checks nothing a second time (CLAUDE.md rule 1).

const noSubscription = () => () => undefined;

type Values = {
  fullName: string;
  username: string;
  phone: string;
  role: Role;
  locale: "uz" | "ru" | "en";
  branchIds: string[];
  password: string;
  replacePrincipal: boolean;
};

const EMPTY: Values = {
  fullName: "",
  username: "",
  phone: "",
  role: "MANAGER",
  locale: "uz",
  branchIds: [],
  password: "",
  replacePrincipal: false,
};

function randomBytes(count: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(count));
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

type Props = { user: UserDetail | null; choices: BranchChoice[] };

export function UserForm({ user, choices }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const create = useAction(createUserAction, { create: true });
  const update = useAction(updateUserAction);
  const action = user ? update : create;
  const [shown, setShown] = useState<{ id: string; username: string; password: string } | null>(
    null,
  );
  const loaded: Values = user
    ? {
        ...EMPTY,
        fullName: user.fullName,
        username: user.username,
        phone: user.phone,
        role: user.role,
        locale: user.locale,
        branchIds: user.branches.map((branch) => branch.id),
      }
    : EMPTY;
  const { register, handleSubmit, reset, setValue, control, formState } = useForm<Values>({
    defaultValues: loaded,
  });
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const loadedKey = JSON.stringify(loaded);
  useEffect(() => {
    reset(JSON.parse(loadedKey) as Values);
  }, [loadedKey, reset]);

  const role = useWatch({ control, name: "role" });
  const branchIds = useWatch({ control, name: "branchIds" });
  const replacePrincipal = useWatch({ control, name: "replacePrincipal" });
  const error = (field: string) =>
    action.fieldTexts[field] ?? action.fieldTexts[`${field}.0`] ?? undefined;

  // The Principal this choice would replace: only a Principal who is active (or new) needs room.
  const chosen = choices.find((choice) => choice.id === branchIds[0]);
  const needsReplace =
    role === "PRINCIPAL" && (user === null || user.isActive) && chosen?.principal != null;

  function chooseBranches(next: string[]) {
    setValue("branchIds", next, { shouldDirty: true });
    setValue("replacePrincipal", false, { shouldDirty: true });
  }

  function chooseRole(next: Role) {
    setValue("role", next, { shouldDirty: true });
    if (next === "HEAD") chooseBranches([]);
    else if (next === "PRINCIPAL") chooseBranches(branchIds.slice(0, 1));
  }

  // Replacing a Principal deactivates and signs out another person: the confirm dialog states it
  // first (11 rule 6; review of 1.3, Should fix 3).
  const [confirming, setConfirming] = useState<Values | null>(null);
  const replacing = (current: Values) =>
    needsReplace &&
    current.replacePrincipal &&
    (user === null || !sameSet(current.branchIds, loaded.branchIds));

  const onSubmit = handleSubmit(async (current) => {
    if (replacing(current)) {
      setConfirming(current);
      return;
    }
    await send(current);
  });

  async function send(current: Values) {
    if (!user) {
      const result = await create.run({
        ...current,
        replacePrincipal: needsReplace && current.replacePrincipal,
      });
      if (!result) return;
      if (!result.ok) {
        toast.error(t(result.error.messageKey));
        return;
      }
      toast.success(t("users.created"));
      reset(EMPTY);
      setShown({ id: result.data.id, username: result.data.username, password: current.password });
      return;
    }
    const sent: Record<string, unknown> = { id: user.id };
    for (const field of ["fullName", "username", "phone", "locale"] as const) {
      if (current[field] !== loaded[field]) sent[field] = current[field];
    }
    if (!sameSet(current.branchIds, loaded.branchIds)) {
      sent.branchIds = current.branchIds;
      if (needsReplace && current.replacePrincipal) sent.replacePrincipal = true;
    }
    const result = await update.run(sent);
    if (!result) return;
    if (!result.ok) {
      toast.error(t(result.error.messageKey));
      return;
    }
    toast.success(t(result.data.changed.length > 0 ? "users.saved" : "users.nothingChanged"));
    reset(current);
    router.refresh();
  }

  async function confirmReplace() {
    const current = confirming;
    if (!current) return;
    await send(current);
    setConfirming(null);
  }

  if (shown) {
    return (
      <div className="flex flex-col gap-4">
        <ShownPassword username={shown.username} password={shown.password} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/users/${shown.id}`}
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            {t("users.openUser")}
          </Link>
          <Button variant="secondary" onClick={() => setShown(null)} className="w-full sm:w-auto">
            {t("users.createAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl bg-card p-6 text-card-foreground"
    >
      <UnsavedChangesGuard dirty={formState.isDirty && !action.pending} />
      <Field id="user-full-name" label={t("users.fullName")} error={error("fullName")}>
        <Input {...register("fullName")} maxLength={200} autoComplete="off" />
      </Field>
      <Field id="user-username" label={t("users.username")} error={error("username")}>
        <Input
          {...register("username")}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="sm:max-w-80"
          aria-describedby={
            error("username") ? "user-username-error user-username-hint" : "user-username-hint"
          }
        />
      </Field>
      <p id="user-username-hint" className="-mt-3 text-sm leading-5 text-muted-foreground">
        {t("users.usernameHint")}
      </p>
      <Field id="user-phone" label={t("users.phone")} error={error("phone")}>
        <Input
          {...register("phone")}
          type="tel"
          inputMode="tel"
          maxLength={40}
          autoComplete="off"
          className="sm:max-w-80"
        />
      </Field>
      {user ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-5 font-semibold">{t("users.role")}</span>
          <span>{t(`roles.${user.role}`)}</span>
          <span className="text-sm leading-5 text-muted-foreground">{t("users.roleFixed")}</span>
        </div>
      ) : (
        <Field id="user-role" label={t("users.role")} error={error("role")}>
          <Select
            value={role}
            onChange={(event) => chooseRole(event.target.value as Role)}
            className="sm:max-w-80"
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {t(`roles.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="user-locale" label={t("users.language")} error={error("locale")}>
        <Select {...register("locale")} className="sm:max-w-80">
          {LOCALES.map((value) => (
            <option key={value} value={value}>
              {t(`languages.${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={error("branchIds") ? "user-branches-error" : undefined}
      >
        <legend className="mb-1.5 text-sm leading-5 font-semibold">
          {t(role === "PRINCIPAL" ? "users.branch" : "users.branches")}
        </legend>
        {role === "HEAD" ? (
          <p className="text-sm leading-5 text-muted-foreground">{t("users.headBranches")}</p>
        ) : choices.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">{t("users.noBranches")}</p>
        ) : (
          choices.map((choice) => {
            const checked = branchIds.includes(choice.id);
            const label = choice.isActive
              ? `${choice.code} · ${choice.name}`
              : t("users.inactiveBranch", { name: `${choice.code} · ${choice.name}` });
            return (
              <label
                key={choice.id}
                className="flex min-h-11 items-center gap-3 text-sm sm:min-h-8"
              >
                <input
                  type={role === "PRINCIPAL" ? "radio" : "checkbox"}
                  name="branchIds"
                  value={choice.id}
                  checked={checked}
                  disabled={!choice.isActive && !checked}
                  onChange={(event) => {
                    if (role === "PRINCIPAL") chooseBranches([choice.id]);
                    else if (event.target.checked) chooseBranches([...branchIds, choice.id]);
                    else chooseBranches(branchIds.filter((id) => id !== choice.id));
                  }}
                  className="size-5 shrink-0 accent-foreground"
                />
                {label}
              </label>
            );
          })
        )}
        {error("branchIds") && (
          <p id="user-branches-error" className="text-sm leading-5 text-destructive">
            {error("branchIds")}
          </p>
        )}
      </fieldset>

      {needsReplace && (
        <label className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
          <input
            type="checkbox"
            checked={replacePrincipal}
            onChange={(event) =>
              setValue("replacePrincipal", event.target.checked, { shouldDirty: true })
            }
            className="mt-0.5 size-5 shrink-0 accent-foreground"
          />
          {t("users.replace", { name: chosen!.principal!.fullName })}
        </label>
      )}

      {!user && (
        <div className="flex flex-col gap-1.5">
          <Field id="user-password" label={t("users.password")} error={error("password")}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                {...register("password")}
                type="text"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={4096}
                className="sm:max-w-80"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setValue("password", generatePassword(randomBytes), { shouldDirty: true })
                }
                className="w-full sm:w-auto"
              >
                {t("users.generate")}
              </Button>
            </div>
          </Field>
          <p className="text-sm leading-5 text-muted-foreground">{t("users.passwordHint")}</p>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        pending={action.pending}
        onConfirm={confirmReplace}
        text={{
          title: t("users.replaceTitle", { name: chosen?.principal?.fullName ?? "" }),
          result: t("users.replaceResult", { name: chosen?.principal?.fullName ?? "" }),
          confirm: t("users.replaceConfirm"),
          danger: true,
        }}
      />
      <Button
        type="submit"
        pending={action.pending}
        disabled={!hydrated}
        className="w-full sm:w-auto sm:self-start"
      >
        {t(user ? "users.save" : "users.create")}
      </Button>
    </form>
  );
}
