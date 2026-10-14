"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type SignInInput, signInInput } from "@/server/auth/sign-in-input";

import { type SignInFailure, signInAction } from "./actions";

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
      <Field id="username" label={t("username")} error={fieldError(errors.username?.message)}>
        <Input
          fieldSize="lg"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          {...form.register("username")}
        />
      </Field>
      <Field id="password" label={t("password")} error={fieldError(errors.password?.message)}>
        <Input
          fieldSize="lg"
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
      </Field>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {failure?.error === "limit"
          ? t("errors.limit", { minutes: failure.minutes })
          : failure
            ? t(`errors.${failure.error}`)
            : null}
      </p>
      <Button type="submit" size="lg" pending={pending} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
