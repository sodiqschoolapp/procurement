"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { type SignInInput, signInInput } from "@/server/auth/sign-in-input";

import { type SignInFailure, signInAction } from "./actions";

const FIELD =
  "h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-2 aria-invalid:border-destructive";

type FieldError = "required" | "tooLong";

export function LoginForm({ returnPath }: { returnPath?: string }) {
  const t = useTranslations("login");
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInInput),
    defaultValues: { username: "", password: "", returnPath },
  });
  const { errors } = form.formState;
  const fieldError = (message: string | undefined) =>
    message ? t(`errors.${message as FieldError}`) : null;

  const onSubmit = form.handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      // On success the action redirects and never returns.
      setFailure(await signInAction(values));
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          {t("username")}
        </label>
        <input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors.username ? true : undefined}
          className={FIELD}
          {...form.register("username")}
        />
        {errors.username && (
          <p className="text-sm text-destructive">{fieldError(errors.username.message)}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          {t("password")}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          className={FIELD}
          {...form.register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{fieldError(errors.password.message)}</p>
        )}
      </div>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {failure?.error === "limit"
          ? t("errors.limit", { minutes: failure.minutes })
          : failure
            ? t(`errors.${failure.error}`)
            : null}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-lg bg-primary font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
