"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { DRAFT_EXTRAS_MAX } from "@/domain/drafts";
import { extrasSum } from "@/domain/order-totals";
import type { WireChoices, WireExtra } from "@/features/orders/draft-wire";
import { useFormatters } from "@/i18n/use-formatters";

// The extra-costs cell of a draft (05-order-request-form.md field 12: "Zero or more rows: type
// from the catalog plus amount. Each amount more than 0. The cell shows the sum"; plan of 2.5b,
// decided item 12). The cell shows extrasSum() of the row's saved amounts, never a value derived
// from the total (review of the plan, Must fix 5). The dialog edits up to 20 rows and saves the
// whole list once on "Done"; the server checks every amount again.

type EditedExtra = { key: string; extraCostTypeId: string; amount: string };

let nextKey = 0;
const keyOf = () => `extra-${(nextKey += 1)}`;

export function ExtrasCell({
  product,
  extras,
  choices,
  editable,
  onOpen,
  onSave,
}: {
  product: string;
  extras: readonly WireExtra[];
  choices: WireChoices | undefined;
  editable: boolean;
  onOpen(): void;
  /** Saves the list; resolves to the field errors of a refusal, or null when it saved. */
  onSave(
    extras: { extraCostTypeId: string; amount: string }[],
  ): Promise<Record<string, string> | null>;
}) {
  const t = useTranslations("orders");
  const tCommon = useTranslations("common");
  const format = useFormatters();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EditedExtra[]>([]);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sum = format.money(extrasSum(extras.map((extra) => BigInt(extra.amount))));

  if (!editable) return <span className="tabular-nums">{sum}</span>;

  function start() {
    onOpen();
    setRows(
      extras.map((extra) => ({
        key: keyOf(),
        extraCostTypeId: extra.extraCostTypeId,
        amount: extra.amount,
      })),
    );
    setErrors({});
    setOpen(true);
  }

  async function done() {
    if (pending) return;
    setPending(true);
    try {
      const refused = await onSave(
        rows.map((row) => ({ extraCostTypeId: row.extraCostTypeId, amount: row.amount })),
      );
      if (refused) setErrors(refused);
      else setOpen(false);
    } finally {
      setPending(false);
    }
  }

  const types = choices?.extraCostTypes ?? [];
  const error = (at: number, field: string) => errors[`extras.${at}.${field}`] ?? errors.extras;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={start}
        aria-label={t("extras.open", { product })}
        className="tabular-nums"
      >
        {sum}
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-sidebar/50 transition-opacity duration-160 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          aria-labelledby={titleId}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-popover p-6 text-popover-foreground shadow-float"
        >
          <h2 id={titleId} className="text-[17px] leading-6 font-bold">
            {t("extras.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{product}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((row, at) => (
              <li key={row.key} className="flex flex-wrap items-start gap-2">
                <div className="min-w-40 flex-1">
                  <Select
                    aria-label={t("extras.type")}
                    value={row.extraCostTypeId}
                    aria-invalid={error(at, "extraCostTypeId") ? true : undefined}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((one) =>
                          one.key === row.key
                            ? { ...one, extraCostTypeId: event.target.value }
                            : one,
                        ),
                      )
                    }
                  >
                    <option value="">{t("extras.pickType")}</option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                    {row.extraCostTypeId &&
                      !types.some((type) => type.id === row.extraCostTypeId) && (
                        <option value={row.extraCostTypeId}>
                          {extras.find((extra) => extra.extraCostTypeId === row.extraCostTypeId)
                            ?.name ?? row.extraCostTypeId}
                        </option>
                      )}
                  </Select>
                </div>
                <div className="w-36">
                  <Input
                    aria-label={t("extras.amount")}
                    inputMode="numeric"
                    value={row.amount}
                    aria-invalid={error(at, "amount") ? true : undefined}
                    className="text-right tabular-nums"
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((one) =>
                          one.key === row.key ? { ...one, amount: event.target.value } : one,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  icon="close"
                  aria-label={t("extras.removeRow")}
                  onClick={() => setRows((current) => current.filter((one) => one.key !== row.key))}
                />
                {(error(at, "amount") || error(at, "extraCostTypeId")) && (
                  <p className="w-full text-sm text-destructive">
                    {error(at, "amount") ?? error(at, "extraCostTypeId")}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            icon="add"
            className={cn("mt-3", rows.length >= DRAFT_EXTRAS_MAX && "hidden")}
            onClick={() =>
              setRows((current) => [...current, { key: keyOf(), extraCostTypeId: "", amount: "" }])
            }
          >
            {t("extras.addRow")}
          </Button>
          {rows.length >= DRAFT_EXTRAS_MAX && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("extras.max", { max: DRAFT_EXTRAS_MAX })}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="button" pending={pending} onClick={() => void done()}>
              {t("extras.done")}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
