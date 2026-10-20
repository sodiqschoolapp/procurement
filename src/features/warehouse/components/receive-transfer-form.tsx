"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { receiveTransferAction } from "@/app/(app)/warehouse/documents/[id]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { receivedQuantityRefusal, transferShort } from "@/domain/stock-documents";
import { useFormatters } from "@/i18n/use-formatters";

// Receive an In-transit transfer (09-warehouse.md, Other documents, Transfer: "The receiving
// Manager enters what really arrived. Any shortage becomes a write-off request 'Lost in transfer'
// on the sending branch for the Head to decide"; 11-screens-and-ux.md rule 6: ask for
// confirmation, say what it covers and state the result; plan of 7.2). Shown only where
// getStockDocument() offers it (`canReceive`); the server asks everything again under the lock.
// Each line's Received field is prefilled with the quantity sent; "Received by" with the sender's
// text, or the receiving user's name (decided item 8). The quantities are checked as they are
// typed with receivedQuantityRefusal(), the server's own rule. Not a create: a second press is
// refused as `wrong_status`, and the page then shows the transfer as received.

export type ReceiveLine = {
  id: string;
  name: string;
  /** numeric(14,3) text, the quantity sent. */
  qty: string;
  unitShortName: string;
  allowsDecimals: boolean;
};

/** A stored quantity as it is typed: "10.000" is "10", "2.500" is "2.5". */
function plain(qty: string): string {
  return qty.includes(".") ? qty.replace(/0+$/, "").replace(/\.$/, "") : qty;
}

export function ReceiveTransferForm({
  documentId,
  number,
  fromBranch,
  toBranch,
  receivedByName,
  lines,
}: {
  documentId: string;
  number: string;
  fromBranch: string;
  toBranch: string;
  receivedByName: string;
  lines: readonly ReceiveLine[];
}) {
  const t = useTranslations("warehouse.documents.receive");
  const tAll = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, plain(line.qty)])),
  );
  const [receiver, setReceiver] = useState(receivedByName);
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});

  // The typed text as a quantity: the formatter's thousands spaces and a comma taken out.
  const typed = (lineId: string) => (received[lineId] ?? "").replace(/\s/g, "").replace(",", ".");
  const refusalOf = (line: ReceiveLine) =>
    receivedQuantityRefusal(typed(line.id), line.allowsDecimals, line.qty);
  const errorOf = (line: ReceiveLine): string | undefined => {
    const refusal = refusalOf(line);
    if (refusal) return tAll(`errors.field.${refusal}`);
    const server = serverFields[`lines.${line.id}.receivedQty`];
    return server ? tAll(server as Parameters<typeof tAll>[0]) : undefined;
  };
  const valid = lines.every((line) => refusalOf(line) === null);
  const shortLines = valid
    ? lines.filter((line) => transferShort(line.qty, typed(line.id)) !== "0")
    : [];

  async function run() {
    setPending(true);
    try {
      const answer = await receiveTransferAction({
        documentId,
        receivedByName: receiver,
        lines: lines.map((line) => ({ lineId: line.id, receivedQty: typed(line.id) })),
      });
      if (answer.ok) {
        setDirty(false);
        toast.success(
          answer.data.writeOff?.number
            ? t("receivedShort", { number, writeOff: answer.data.writeOff.number })
            : answer.data.writeOff
              ? t("receivedShortAsked", { number })
              : t("received", { number }),
        );
        return;
      }
      setServerFields(answer.error.fields ?? {});
      toast.error(tAll(answer.error.messageKey));
    } catch {
      toast.error(tAll("errors.network"));
    } finally {
      setAsking(false);
      setPending(false);
      router.refresh();
    }
  }

  return (
    <section
      data-receive-transfer
      aria-labelledby="receive-transfer"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <UnsavedChangesGuard dirty={dirty} />
      <div className="flex flex-col gap-1">
        <h2 id="receive-transfer" className="text-subheading font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("intro", { from: fromBranch, to: toBranch })}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li
            key={line.id}
            data-receive-line={line.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">{line.name}</span>
              <span className="text-sm leading-5 text-muted-foreground">
                {t("sent", { qty: format.quantity(line.qty), unit: line.unitShortName })}
              </span>
            </div>
            <Field
              id={`receive-qty-${line.id}`}
              label={t("receivedQty", { unit: line.unitShortName })}
              error={errorOf(line)}
              className="sm:w-48"
            >
              <Input
                inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                autoComplete="off"
                value={received[line.id] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setReceived((before) => ({ ...before, [line.id]: value }));
                  setServerFields({});
                  setDirty(true);
                }}
                className="max-sm:h-12"
              />
            </Field>
          </li>
        ))}
      </ul>
      <Field id="receive-received-by" label={t("receivedBy")}>
        <Input
          value={receiver}
          maxLength={120}
          autoComplete="off"
          onChange={(event) => {
            setReceiver(event.target.value);
            setDirty(true);
          }}
          className="max-sm:h-12"
        />
      </Field>
      <div className="flex flex-col sm:flex-row sm:justify-end">
        <Button
          icon="inventory"
          className="max-sm:h-12 max-sm:w-full"
          disabled={!valid}
          onClick={() => setAsking(true)}
        >
          {t("confirm")}
        </Button>
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => !open && !pending && setAsking(false)}
        pending={pending}
        text={{
          title: t("confirmTitle", { number }),
          result:
            shortLines.length === 0
              ? t("confirmResult", { count: lines.length, to: toBranch })
              : t("confirmResultShort", {
                  count: lines.length,
                  to: toBranch,
                  short: shortLines.length,
                  from: fromBranch,
                }),
          confirm: t("confirm"),
        }}
        onConfirm={() => void run()}
      />
    </section>
  );
}
