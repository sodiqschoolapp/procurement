"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";

// The confirm dialog (11-screens-and-ux.md rule 6: "Irreversible actions ... ask for
// confirmation and state the result"). A title, the sentence that states the result, Cancel and
// the confirm button: primary, or danger for an irreversible loss. It floats, so it has the one
// float shadow and opens in 160 ms, ease-out (docs/design-system.md; review corrections 4, 5).
// Base UI Alert Dialog keeps focus inside and returns it to where it came from.

export type ConfirmDialogText = {
  /** What is asked, a text from the message files. */
  title: string;
  /** The sentence that states the result. */
  result: string;
  /** The confirm button's words: the action itself ("Reject"), never "OK". */
  confirm: string;
  /** Danger kind for an irreversible loss. */
  danger?: boolean;
};

/** The dialog's content; ConfirmDialog places it in the Base UI popup. */
export function ConfirmDialogBody({
  titleId,
  resultId,
  text,
  pending = false,
  confirmDisabled = false,
  disabledReason,
  onConfirm,
  onCancel,
  children,
}: {
  titleId: string;
  resultId: string;
  text: ConfirmDialogText;
  pending?: boolean;
  /** While what the user still has to give is missing (a reason too short); the server checks again. */
  confirmDisabled?: boolean;
  /** Why the confirm button cannot be pressed yet, said beside it (no reasonless grey button). */
  disabledReason?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** What the user may still set before confirming, under the result (Finance's payment types). */
  children?: ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <>
      <h2 id={titleId} className="text-subheading font-semibold">
        {text.title}
      </h2>
      <p id={resultId} className="mt-2 text-sm text-muted-foreground">
        {text.result}
      </p>
      {children}
      {confirmDisabled && !pending && disabledReason ? (
        <p
          data-confirm-why
          className="mt-4 flex items-center gap-1.5 text-small text-muted-foreground"
        >
          <Icon name="info" size={16} className="shrink-0" />
          {disabledReason}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button
          variant={text.danger ? "destructive" : "default"}
          pending={pending}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {text.confirm}
        </Button>
      </div>
    </>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  text,
  pending = false,
  confirmDisabled = false,
  disabledReason,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: ConfirmDialogText;
  pending?: boolean;
  confirmDisabled?: boolean;
  disabledReason?: string | null;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const resultId = useId();
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] transition-opacity duration-160 ease-out",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <AlertDialog.Popup
          aria-labelledby={titleId}
          aria-describedby={resultId}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-float sm:p-6",
            "transition-[opacity,scale] duration-160 ease-out",
            "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
          )}
        >
          <ConfirmDialogBody
            titleId={titleId}
            resultId={resultId}
            text={text}
            pending={pending}
            confirmDisabled={confirmDisabled}
            disabledReason={disabledReason}
            onConfirm={onConfirm}
            onCancel={() => onOpenChange(false)}
          >
            {children}
          </ConfirmDialogBody>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
