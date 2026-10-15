"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FIELD_CLASSES } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import { cn } from "@/components/utils";

import { declineSuggestionAction } from "./actions";

// Declining a suggestion with a reason (04-catalogs.md rule 8: "declines with a reason"). It
// cannot be undone, so it asks first and states the result (11-screens-and-ux.md rule 6). The
// server checks the reason; a missing one shows under the field.

export function DeclineForm({ suggestionId }: { suggestionId: string }) {
  const t = useTranslations("suggestions");
  const tAll = useTranslations();
  const router = useRouter();
  const decline = useAction(declineSuggestionAction);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  async function confirm() {
    const result = await decline.run({ suggestionId, reason });
    if (!result) return;
    setAsking(false);
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      return;
    }
    toast.success(t("declined"));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1.5">
        <Field id="suggestion-reason" label={t("fields.reason")} error={decline.fieldTexts.reason}>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={600}
            className={cn(FIELD_CLASSES, "min-h-20 py-2")}
            aria-describedby="suggestion-reason-hint"
          />
        </Field>
        <p id="suggestion-reason-hint" className="text-sm leading-5 text-muted-foreground">
          {t("hints.reason")}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        icon="block"
        onClick={() => setAsking(true)}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("decline")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={decline.pending}
        text={{
          title: t("declineTitle"),
          result: t("declineResult"),
          confirm: t("decline"),
          danger: true,
        }}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
