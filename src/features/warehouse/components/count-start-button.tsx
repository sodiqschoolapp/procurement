"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { startCountAction } from "@/app/(app)/warehouse/counts/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FIELD_CLASSES } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { newClientKey } from "@/components/client-key";
import { cn } from "@/components/utils";
import { DRAFT_COMMENT_MAX } from "@/domain/drafts";

// Start a count (09-warehouse.md, Other documents, Stock count: "The Manager starts a count for a
// branch or a category"; 11-screens-and-ux.md rule 6: an action that cannot be undone asks first
// and states the result; plan of 7.3, review of the plan, should fix 4). Shown only where the page
// offers branches (`countBranchChoices`); the server asks everything again. The dialog says that
// the count takes the stock of this moment and cannot be removed. One browser-made key per
// opening, so a second press of Start returns the same count (developer-rules.md rule 8).

export type CountBranchChoice = { id: string; code: string; name: string };
export type CountCategoryChoice = { id: string; name: string; isActive: boolean };

export function CountStartButton({
  branches,
  categories,
  initialBranchId,
}: {
  branches: readonly CountBranchChoice[];
  categories: readonly CountCategoryChoice[];
  initialBranchId: string;
}) {
  const t = useTranslations("warehouse.count");
  const tWhy = useTranslations("common.whyNot");
  const tAll = useTranslations();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [clientKey, setClientKey] = useState("");
  const [branchId, setBranchId] = useState(initialBranchId);
  const [categoryId, setCategoryId] = useState("");
  const [comment, setComment] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  function open() {
    setClientKey(newClientKey());
    setBranchId(initialBranchId);
    setCategoryId("");
    setComment("");
    setFields({});
    setAsking(true);
  }

  async function run() {
    setPending(true);
    try {
      const answer = await startCountAction({
        clientKey,
        branchId,
        categoryId: categoryId || null,
        comment: comment.trim() === "" ? null : comment,
      });
      if (answer.ok) {
        toast.success(t("started", { number: answer.data.number }));
        setAsking(false);
        router.push(`/warehouse/documents/${answer.data.documentId}`);
        return;
      }
      setFields(answer.error.fields ?? {});
      toast.error(tAll(answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      setPending(false);
    }
  }

  const errorOf = (field: string) =>
    fields[field] ? tAll(fields[field] as Parameters<typeof tAll>[0]) : undefined;

  return (
    <>
      <Button icon="add" className="max-sm:h-12 max-sm:w-full" onClick={open} data-count-start>
        {t("start")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={(next) => !next && !pending && setAsking(false)}
        pending={pending}
        confirmDisabled={branchId === ""}
        disabledReason={tWhy("branch")}
        text={{ title: t("startTitle"), result: t("startResult"), confirm: t("start") }}
        onConfirm={() => void run()}
      >
        <div className="mt-4 flex flex-col gap-4">
          <Field id="count-branch" label={t("branch")} error={errorOf("branchId")}>
            <Select
              value={branchId}
              disabled={pending}
              onChange={(event) => {
                setBranchId(event.target.value);
                setFields({});
              }}
              data-count-branch
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {t("branchOption", { code: branch.code, name: branch.name })}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="count-category" label={t("category")} error={errorOf("categoryId")}>
            <Select
              value={categoryId}
              disabled={pending}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setFields({});
              }}
              data-count-category
            >
              <option value="">{t("wholeBranch")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.isActive
                    ? category.name
                    : t("inactiveCategory", { name: category.name })}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="count-comment" label={t("comment")} error={errorOf("comment")}>
            <textarea
              id="count-comment"
              value={comment}
              rows={2}
              maxLength={DRAFT_COMMENT_MAX}
              disabled={pending}
              onChange={(event) => setComment(event.target.value)}
              className={cn(FIELD_CLASSES, "min-h-16 py-2")}
            />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}
