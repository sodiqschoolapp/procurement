"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useAction } from "@/components/use-action";
import { generatePassword } from "@/domain/passwords";

import { renewUserPasswordAction } from "./actions";
import { ShownPassword } from "./shown-password";

// "Renew password" on a user's page (A8: the Head renews any user's password, typed or
// generated; the renewal signs that user out on every device; the new password is shown to the
// Head at that moment only). Not offered on the Head's own page: users cannot change their own
// (plan of 1.3, Look first 2); the server refuses it too.

const noSubscription = () => () => undefined;

function randomBytes(count: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(count));
}

export function RenewPassword({
  user,
}: {
  user: { id: string; fullName: string; username: string };
}) {
  const t = useTranslations("users");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(renewUserPasswordAction);
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  async function confirm() {
    const sent = password;
    const result = await action.run({ id: user.id, password: sent });
    if (!result) return;
    setOpen(false);
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      return;
    }
    toast.success(t("renewed"));
    setPassword("");
    setShown(sent);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
      <UnsavedChangesGuard dirty={password !== "" && !action.pending} />
      <h2 className="text-[17px] leading-6 font-bold">{t("renewTitle")}</h2>
      <p className="text-sm leading-5 text-muted-foreground">{t("renewText")}</p>
      {shown && <ShownPassword username={user.username} password={shown} />}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        className="flex flex-col gap-4"
      >
        <Field id="renew-password" label={t("password")} error={action.fieldTexts.password}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="text"
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={4096}
              className="font-mono sm:max-w-80"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPassword(generatePassword(randomBytes))}
              className="w-full sm:w-auto"
            >
              {t("generate")}
            </Button>
          </div>
        </Field>
        <Button
          type="submit"
          disabled={!hydrated || password === ""}
          className="w-full sm:w-auto sm:self-start"
        >
          {t("renew")}
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={action.pending}
        onConfirm={confirm}
        text={{
          title: t("renewConfirmTitle", { name: user.fullName }),
          result: t("renewConfirmResult", { name: user.fullName }),
          confirm: t("renew"),
          danger: false,
        }}
      />
    </section>
  );
}
