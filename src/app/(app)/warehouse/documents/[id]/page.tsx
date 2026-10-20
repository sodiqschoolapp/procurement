import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/icon";
import { DocumentStatusLabel } from "@/components/status-label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import type { WriteOffReason } from "@/domain/stock-documents";
import { signedQuantity } from "@/features/warehouse/components/count-difference";
import { CancelTransferButton } from "@/features/warehouse/components/cancel-transfer-button";
import { CountAgainMark } from "@/features/warehouse/components/count-again-mark";
import { CountDecision } from "@/features/warehouse/components/count-decision";
import { CountSheetForm } from "@/features/warehouse/components/count-sheet-form";
import { ReceiveTransferForm } from "@/features/warehouse/components/receive-transfer-form";
import { ReverseDocumentButton } from "@/features/warehouse/components/reverse-document-button";
import { WriteOffDecision } from "@/features/warehouse/components/write-off-decision";
import { type DocumentLine, getStockDocument } from "@/features/warehouse/queries/document";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

// /warehouse/documents/[id], a warehouse document's own page, of every type (09-warehouse.md,
// Movement types; Issue to a department; Other documents; Direct entry by the Head; plan of 5.11,
// decided item 11, opened to every type by 5.12, decided item 3, Look first: the documents list
// and the item card link here). Every role that sees the branch reads it (03 "See orders, stock
// and reports"); another branch and an unknown id are the "Not found" page (03 rule 1). The
// header shows the fields of its type; no money (decided item 7). A waiting write-off's lines
// show the stock of now; Approve and Refuse, fixed at the bottom, only where the query offers
// them (`canDecide`), anyone else reads who it waits for. Reverse (the item card's dialog) and the
// issue or transfer note only where the query offers them. A transfer's header names the sending
// and the receiving branch and who sent it (plan of 7.1). An In-transit transfer shows the receive
// form to whom the query offers it (`canReceive`); a received one shows each line's Sent, Received
// and Short, and who confirmed the receipt (plan of 7.2). A count's lines show the stock at start,
// the counted quantity and the difference, never the stock of now (plan of 7.3, review of the
// plan, must fix 3); to whom the query offers it (`canCount`) they are the counting form instead,
// unless the Head may approve it now (`canApprove`): then the lines are read and Approve and
// Refuse sit at the bottom (plan of 7.4). The Head typing an incomplete count gets Refuse below
// the form, not fixed. A line sent back is marked "Count again"; a complete count tells everyone
// else it waits for the Head. A refused write-off or count shows why, to everyone who reads it;
// an In-transit transfer offers Cancel with a reason to whom the query offers it (`canCancel`), and
// a cancelled one shows who cancelled it and why (plan of 7.4c). A direct entry shows the Head each line's cost per unit, which the
// query reads for the Head only (plan of 7.4b). At phone width the lines are cards.

export default async function StockDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/warehouse/documents/${encodeURIComponent(id)}`);
  const userName = user.fullName;
  const document = await getStockDocument(user.id, id);
  if (!document) notFound();
  const t = await getTranslations("warehouse.documents");
  const tWriteOff = await getTranslations("warehouse.writeOff");
  const tEntry = await getTranslations("warehouse.directEntry");
  const tCount = await getTranslations("warehouse.count");
  const format = await getFormatters();
  const at = (moment: Date) => `${format.date(moment)} ${format.time(moment)}`;
  const quantity = (qty: string, unit: string) => `${format.quantity(qty)} ${unit}`;
  const signed = (difference: string, unit: string) =>
    `${signedQuantity(difference, format.quantity)} ${unit}`;
  const itemName = (line: DocumentLine) =>
    line.subtypeName ? `${line.productName} · ${line.subtypeName}` : line.productName;
  // The stock of now beside a waiting write-off's lines, which the Head weighs; never a count's.
  const waiting = document.type === "WRITE_OFF" && document.status === "PENDING_APPROVAL";
  const count = document.type === "COUNT";
  // A direct entry's cost per unit, which the query sends to the Head only (plan of 7.4b).
  const costed = document.lines.some((line) => line.unitCost !== null);
  const reason =
    document.reason === null
      ? null
      : document.type === "DIRECT_ENTRY"
        ? tEntry(`reasons.${document.reason as "EXISTING_STOCK" | "GIFT" | "OTHER"}`)
        : tWriteOff(`reasons.${document.reason as WriteOffReason}`);
  const transfer = document.type === "TRANSFER";
  const fields: { key: string; label: string; value: string; wide?: boolean }[] = transfer
    ? [
        { key: "branch", label: t("page.from"), value: document.branchCode },
        { key: "toBranch", label: t("page.to"), value: document.toBranchCode ?? "" },
        { key: "date", label: t("page.date"), value: format.date(document.docDate) },
      ]
    : [
        { key: "branch", label: t("page.branch"), value: document.branchCode },
        { key: "date", label: t("page.date"), value: format.date(document.docDate) },
      ];
  if (document.departmentName !== null) {
    fields.push({ key: "department", label: t("page.department"), value: document.departmentName });
  }
  if (document.receivedByName) {
    fields.push({ key: "receivedBy", label: t("page.receivedBy"), value: document.receivedByName });
  }
  if (reason !== null) fields.push({ key: "reason", label: t("page.reason"), value: reason });
  fields.push({
    key: "createdBy",
    label:
      document.type === "WRITE_OFF"
        ? tWriteOff("page.askedBy")
        : transfer
          ? t("page.sentBy")
          : t("page.createdBy"),
    value: t("page.byAt", { name: document.createdBy, at: at(document.createdAt) }),
  });
  const cancelled = document.status === "CANCELLED";
  if (document.decidedBy && document.decidedAt) {
    fields.push({
      key: "decidedBy",
      label: cancelled
        ? t("page.cancelledBy")
        : transfer
          ? t("page.confirmedBy")
          : t("page.decidedBy"),
      value: t("page.byAt", { name: document.decidedBy, at: at(document.decidedAt) }),
    });
  }
  if (document.decisionReason) {
    fields.push({
      key: "decisionReason",
      label: cancelled ? t("page.cancelReason") : t("page.refuseReason"),
      value: document.decisionReason,
      wide: true,
    });
  }
  if (document.reversedBy && document.reversedAt) {
    fields.push({
      key: "reversedBy",
      label: t("page.reversedBy"),
      value: t("page.byAt", { name: document.reversedBy, at: at(document.reversedAt) }),
    });
    fields.push({
      key: "reverseReason",
      label: t("page.reverseReason"),
      value: document.reverseReason ?? "",
      wide: true,
    });
  }
  if (document.comment) {
    fields.push({ key: "comment", label: t("page.comment"), value: document.comment, wide: true });
  }

  const received = transfer && document.lines.some((line) => line.receivedQty !== null);
  const column = (label: string, qty: string, unit: string) => (
    <td className="py-2 pr-3 text-right tabular-nums max-sm:p-0 max-sm:text-left">
      <span className="sm:hidden">{t("page.labelled", { label, value: quantity(qty, unit) })}</span>
      <span className="max-sm:hidden">{quantity(qty, unit)}</span>
    </td>
  );

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-title">
          {t("page.title", { type: t(`types.${document.type}`), number: document.number })}
        </h1>
        <DocumentStatusLabel type={document.type} status={document.status} />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.key}
              data-field={field.key}
              className={cn("flex flex-col gap-0.5", field.wide && "sm:col-span-2")}
            >
              <dt className="text-sm leading-5 font-semibold">{field.label}</dt>
              <dd className="break-words whitespace-pre-line">{field.value}</dd>
            </div>
          ))}
        </dl>
        {document.imported && (
          <p data-imported className="mt-4 text-sm leading-5 text-muted-foreground">
            {t("page.imported")}
          </p>
        )}
      </section>

      {document.canCount && !document.canApprove ? (
        <CountSheetForm
          documentId={document.id}
          number={document.number}
          lines={document.lines.map((line) => ({
            id: line.id,
            name: itemName(line),
            qty: line.qty,
            countedQty: line.countedQty,
            unitShortName: line.unitShortName,
            allowsDecimals: line.allowsDecimals,
            recount: line.recount,
          }))}
        />
      ) : (
        <section
          aria-labelledby="document-lines"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <h2 id="document-lines" className="text-subheading font-semibold">
            {t("page.lines")}
          </h2>
          <table className="w-full text-sm max-sm:block">
            <thead className="max-sm:sr-only">
              <tr className="border-b border-border text-left text-sm leading-5 text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t("page.product")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  {document.type === "WRITE_OFF"
                    ? tWriteOff("page.quantity")
                    : transfer
                      ? t("page.sent")
                      : count
                        ? tCount("stockAtStart")
                        : t("page.quantity")}
                </th>
                {count && (
                  <>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">
                      {tCount("counted")}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">
                      {tCount("difference")}
                    </th>
                  </>
                )}
                {received && (
                  <>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">
                      {t("page.received")}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">
                      {t("page.short")}
                    </th>
                  </>
                )}
                {costed && (
                  <th scope="col" className="py-2 text-right font-semibold">
                    {t("page.unitCost")}
                  </th>
                )}
                {waiting && (
                  <th scope="col" className="py-2 text-right font-semibold">
                    {t("page.inStock")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-3">
              {document.lines.map((line) => (
                <tr
                  key={line.id}
                  data-document-line={line.id}
                  className="border-b border-border last:border-0 max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:rounded-lg max-sm:border max-sm:p-3"
                >
                  <td className="py-2 pr-3 font-semibold max-sm:p-0">
                    {count && line.recount && line.countedQty === null ? (
                      <span className="flex flex-col gap-1">
                        {itemName(line)}
                        <CountAgainMark label={tCount("decision.countAgain")} />
                      </span>
                    ) : (
                      itemName(line)
                    )}
                  </td>
                  {column(
                    transfer ? t("page.sent") : count ? tCount("stockAtStart") : t("page.quantity"),
                    line.qty,
                    line.unitShortName,
                  )}
                  {count &&
                    (line.countedQty === null ? (
                      <td
                        data-count-counted
                        className="py-2 pr-3 text-right text-muted-foreground max-sm:p-0 max-sm:text-left"
                      >
                        {tCount("notCounted")}
                      </td>
                    ) : (
                      column(tCount("counted"), line.countedQty, line.unitShortName)
                    ))}
                  {count && (
                    <td
                      data-count-difference
                      className="py-2 pr-3 text-right tabular-nums max-sm:p-0 max-sm:text-left"
                    >
                      {line.difference !== null && (
                        <>
                          <span className="sm:hidden">
                            {t("page.labelled", {
                              label: tCount("difference"),
                              value: signed(line.difference, line.unitShortName),
                            })}
                          </span>
                          <span className="max-sm:hidden">
                            {signed(line.difference, line.unitShortName)}
                          </span>
                        </>
                      )}
                    </td>
                  )}
                  {received &&
                    column(t("page.received"), line.receivedQty ?? "0", line.unitShortName)}
                  {received && column(t("page.short"), line.shortQty ?? "0", line.unitShortName)}
                  {costed && (
                    <td
                      data-unit-cost
                      className="py-2 text-right tabular-nums max-sm:p-0 max-sm:text-left"
                    >
                      {line.unitCost !== null && (
                        <>
                          <span className="sm:hidden">
                            {t("page.labelled", {
                              label: t("page.unitCost"),
                              value: format.money(line.unitCost),
                            })}
                          </span>
                          <span className="max-sm:hidden">{format.money(line.unitCost)}</span>
                        </>
                      )}
                    </td>
                  )}
                  {waiting && (
                    <td className="py-2 text-right tabular-nums max-sm:p-0 max-sm:text-left">
                      <span className="sm:hidden">
                        {t("page.labelled", {
                          label: t("page.inStock"),
                          value: quantity(line.inStock ?? "0", line.unitShortName),
                        })}
                      </span>
                      <span className="max-sm:hidden">
                        {quantity(line.inStock ?? "0", line.unitShortName)}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(document.canReverse || document.canDownloadNote || document.canCancel) && (
        <div
          aria-label={t("page.actions")}
          role="group"
          className="flex flex-col gap-3 sm:flex-row sm:justify-end max-sm:[&>*]:w-full"
        >
          {document.canDownloadNote && (
            <a
              href={`/warehouse/documents/${document.id}/note`}
              download
              className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
            >
              <Icon name="download" />
              {transfer ? t("page.downloadTransferNote") : t("page.downloadNote")}
            </a>
          )}
          {document.canReverse && (
            <ReverseDocumentButton documentId={document.id} number={document.number} />
          )}
          {document.canCancel && (
            <CancelTransferButton
              documentId={document.id}
              number={document.number}
              fromBranch={document.branchCode}
              toBranch={document.toBranchCode ?? ""}
            />
          )}
        </div>
      )}

      {count && document.canDecide ? (
        <CountDecision
          documentId={document.id}
          number={document.number}
          lines={document.lines}
          canApprove={document.canApprove}
          changes={document.countChanges}
          fixed={document.canApprove || !document.canCount}
        />
      ) : document.canDecide ? (
        <WriteOffDecision
          documentId={document.id}
          number={document.number}
          lines={document.lines}
        />
      ) : document.canReceive ? (
        <ReceiveTransferForm
          documentId={document.id}
          number={document.number}
          fromBranch={document.branchCode}
          toBranch={document.toBranchCode ?? ""}
          receivedByName={document.receivedByName ?? userName}
          lines={document.lines.map((line) => ({
            id: line.id,
            name: itemName(line),
            qty: line.qty,
            unitShortName: line.unitShortName,
            allowsDecimals: line.allowsDecimals,
          }))}
        />
      ) : transfer && document.status === "IN_TRANSIT" ? (
        <p data-transfer-in-transit className="text-sm text-muted-foreground">
          {t("page.inTransit", {
            from: document.branchCode,
            to: document.toBranchCode ?? "",
          })}
        </p>
      ) : transfer && cancelled ? (
        <p data-transfer-cancelled className="text-sm text-muted-foreground">
          {t("page.cancelled", {
            from: document.branchCode,
            to: document.toBranchCode ?? "",
          })}
        </p>
      ) : document.countAsked ? (
        <p data-count-waiting className="text-sm text-muted-foreground">
          {tCount("decision.waiting")}
        </p>
      ) : document.type === "WRITE_OFF" && waiting ? (
        <p data-write-off-waiting className="text-sm text-muted-foreground">
          {tWriteOff("page.waiting")}
        </p>
      ) : null}
    </div>
  );
}
