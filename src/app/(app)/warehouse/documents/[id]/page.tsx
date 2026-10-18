import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/icon";
import { DocumentStatusLabel } from "@/components/status-label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import type { WriteOffReason } from "@/domain/stock-documents";
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
// issue note only where the query offers them. At phone width the lines are cards.

export default async function StockDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/warehouse/documents/${encodeURIComponent(id)}`);
  const document = await getStockDocument(user.id, id);
  if (!document) notFound();
  const t = await getTranslations("warehouse.documents");
  const tWriteOff = await getTranslations("warehouse.writeOff");
  const tEntry = await getTranslations("warehouse.directEntry");
  const format = await getFormatters();
  const at = (moment: Date) => `${format.date(moment)} ${format.time(moment)}`;
  const quantity = (qty: string, unit: string) => `${format.quantity(qty)} ${unit}`;
  const itemName = (line: DocumentLine) =>
    line.subtypeName ? `${line.productName} · ${line.subtypeName}` : line.productName;
  const waiting = document.status === "PENDING_APPROVAL";
  const reason =
    document.reason === null
      ? null
      : document.type === "DIRECT_ENTRY"
        ? tEntry(`reasons.${document.reason as "EXISTING_STOCK" | "GIFT" | "OTHER"}`)
        : tWriteOff(`reasons.${document.reason as WriteOffReason}`);
  const fields: { key: string; label: string; value: string; wide?: boolean }[] = [
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
    label: document.type === "WRITE_OFF" ? tWriteOff("page.askedBy") : t("page.createdBy"),
    value: t("page.byAt", { name: document.createdBy, at: at(document.createdAt) }),
  });
  if (document.decidedBy && document.decidedAt) {
    fields.push({
      key: "decidedBy",
      label: t("page.decidedBy"),
      value: t("page.byAt", { name: document.decidedBy, at: at(document.decidedAt) }),
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t("page.title", { type: t(`types.${document.type}`), number: document.number })}
        </h1>
        <DocumentStatusLabel type={document.type} status={document.status} />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <dl className="grid grid-cols-1 gap-4 text-[15px] leading-[22px] sm:grid-cols-2">
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

      <section
        aria-labelledby="document-lines"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h2 id="document-lines" className="text-[17px] leading-6 font-semibold">
          {t("page.lines")}
        </h2>
        <table className="w-full text-[15px] leading-[22px] max-sm:block">
          <thead className="max-sm:sr-only">
            <tr className="border-b border-border text-left text-sm leading-5 text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t("page.product")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                {document.type === "WRITE_OFF" ? tWriteOff("page.quantity") : t("page.quantity")}
              </th>
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
                <td className="py-2 pr-3 font-semibold max-sm:p-0">{itemName(line)}</td>
                <td className="py-2 pr-3 text-right tabular-nums max-sm:p-0 max-sm:text-left">
                  <span className="sm:hidden">
                    {t("page.labelled", {
                      label: t("page.quantity"),
                      value: quantity(line.qty, line.unitShortName),
                    })}
                  </span>
                  <span className="max-sm:hidden">{quantity(line.qty, line.unitShortName)}</span>
                </td>
                {waiting && (
                  <td className="py-2 text-right tabular-nums max-sm:p-0 max-sm:text-left">
                    <span className="sm:hidden">
                      {t("page.labelled", {
                        label: t("page.inStock"),
                        value: quantity(line.inStock, line.unitShortName),
                      })}
                    </span>
                    <span className="max-sm:hidden">
                      {quantity(line.inStock, line.unitShortName)}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(document.canReverse || document.canDownloadNote) && (
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
              {t("page.downloadNote")}
            </a>
          )}
          {document.canReverse && (
            <ReverseDocumentButton documentId={document.id} number={document.number} />
          )}
        </div>
      )}

      {document.canDecide ? (
        <WriteOffDecision
          documentId={document.id}
          number={document.number}
          lines={document.lines}
        />
      ) : document.type === "WRITE_OFF" && waiting ? (
        <p data-write-off-waiting className="text-[15px] leading-[22px] text-muted-foreground">
          {tWriteOff("page.waiting")}
        </p>
      ) : null}
    </div>
  );
}
