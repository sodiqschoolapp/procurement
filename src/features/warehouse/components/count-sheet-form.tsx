"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveCountedQuantitiesAction } from "@/app/(app)/warehouse/documents/[id]/actions";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { countDifference, countedQuantityRefusal } from "@/domain/stock-documents";
import { useFormatters } from "@/i18n/use-formatters";

import { signedQuantity } from "./count-difference";

// Type the counted quantities of a waiting count (09-warehouse.md, Other documents, Stock count:
// "types the counted quantities. The system shows the differences"; plan of 7.3). Shown only where
// getStockDocument() offers it (`canCount`); the server asks everything again under the lock. Each
// line shows the stock at start, the counted field and the difference, countDifference(), the
// formula the page and 7.4 read, recomputed as the user types; quantities are checked with
// countedQuantityRefusal(), the server's own rule. Save sends only the lines changed since the
// page was read, so two people typing different lines both keep theirs (decided item 6); an
// emptied field goes back to not counted. Unsaved changes ask before leaving (11 rule 6; review
// of the plan, must fix 2). At phone width each line is a card and Save stays in a bar above the
// tab bar, as the write-off decision's.

export type CountSheetLine = {
  id: string;
  name: string;
  /** numeric(14,3) text, the stock at the start of the count. */
  qty: string;
  /** numeric(14,3) text as saved; null while not counted. */
  countedQty: string | null;
  unitShortName: string;
  allowsDecimals: boolean;
};

/** A stored quantity as it is typed: "10.000" is "10", "2.500" is "2.5". */
function plain(qty: string): string {
  return qty.includes(".") ? qty.replace(/0+$/, "").replace(/\.$/, "") : qty;
}

export function CountSheetForm({
  documentId,
  number,
  lines,
}: {
  documentId: string;
  number: string;
  lines: readonly CountSheetLine[];
}) {
  const t = useTranslations("warehouse.count");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const saved = () =>
    Object.fromEntries(
      lines.map((line) => [line.id, line.countedQty === null ? "" : plain(line.countedQty)]),
    );
  const [base, setBase] = useState<Record<string, string>>(saved);
  const [counted, setCounted] = useState<Record<string, string>>(saved);
  const [pending, setPending] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});

  // The typed text as a quantity: the formatter's thousands spaces and a comma taken out.
  const typed = (lineId: string) => (counted[lineId] ?? "").replace(/\s/g, "").replace(",", ".");
  const refusalOf = (line: CountSheetLine) => {
    const text = typed(line.id);
    return text === "" ? null : countedQuantityRefusal(text, line.allowsDecimals);
  };
  const errorOf = (line: CountSheetLine): string | undefined => {
    const refusal = refusalOf(line);
    if (refusal) return tAll(`errors.field.${refusal}`);
    const server = serverFields[`lines.${line.id}.countedQty`];
    return server ? tAll(server as Parameters<typeof tAll>[0]) : undefined;
  };
  const differenceOf = (line: CountSheetLine): string | null => {
    const text = typed(line.id);
    if (text === "" || refusalOf(line) !== null) return null;
    return countDifference(line.qty, text);
  };
  const changed = lines.filter((line) => typed(line.id) !== (base[line.id] ?? ""));
  const dirty = changed.length > 0;
  const valid = lines.every((line) => refusalOf(line) === null);

  async function save() {
    setPending(true);
    const sent = Object.fromEntries(changed.map((line) => [line.id, typed(line.id)]));
    try {
      const answer = await saveCountedQuantitiesAction({
        documentId,
        lines: changed.map((line) => ({ lineId: line.id, countedQty: sent[line.id] || null })),
      });
      if (answer.ok) {
        setBase((before) => ({ ...before, ...sent }));
        setServerFields({});
        toast.success(t("saved", { number }));
        return;
      }
      setServerFields(answer.error.fields ?? {});
      toast.error(tAll(answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <section
      data-count-sheet
      aria-labelledby="count-sheet"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <UnsavedChangesGuard dirty={dirty} />
      <div className="flex flex-col gap-1">
        <h2 id="count-sheet" className="text-[17px] leading-6 font-semibold">
          {t("sheetTitle")}
        </h2>
        <p className="text-[15px] leading-[22px] text-muted-foreground">{t("sheetIntro")}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const difference = differenceOf(line);
          return (
            <li
              key={line.id}
              data-count-line={line.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] leading-[22px] font-semibold">{line.name}</span>
                <span className="text-sm leading-5 text-muted-foreground">
                  {t("stockAtStartLine", {
                    qty: format.quantity(line.qty),
                    unit: line.unitShortName,
                  })}
                </span>
              </div>
              <Field
                id={`count-qty-${line.id}`}
                label={t("countedLabel", { unit: line.unitShortName })}
                error={errorOf(line)}
                className="sm:w-40"
              >
                <Input
                  inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                  autoComplete="off"
                  value={counted[line.id] ?? ""}
                  disabled={pending}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCounted((before) => ({ ...before, [line.id]: value }));
                    setServerFields({});
                  }}
                  className="max-sm:h-12"
                />
              </Field>
              <div className="flex flex-col gap-0.5 sm:w-32 sm:text-right">
                <span className="text-sm leading-5 font-semibold">{t("difference")}</span>
                <span className="text-[15px] leading-[22px] tabular-nums" data-count-difference>
                  {difference === null
                    ? t("notCounted")
                    : `${signedQuantity(difference, format.quantity)} ${line.unitShortName}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 z-10 -mx-4 flex border-t border-border bg-card p-4 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:justify-end sm:border-0 sm:p-0">
        <Button
          icon="check_circle"
          className="max-sm:h-12 max-sm:w-full"
          disabled={!dirty || !valid || pending}
          onClick={() => void save()}
          data-count-save
        >
          {t("save")}
        </Button>
      </div>
    </section>
  );
}
