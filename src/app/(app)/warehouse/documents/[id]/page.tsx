import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { WriteOffStatusLabel } from "@/components/status-label";
import { WriteOffDecision } from "@/features/warehouse/components/write-off-decision";
import { getWriteOff } from "@/features/warehouse/queries/write-off";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

// /warehouse/documents/[id], a write-off's own page (09-warehouse.md, Other documents, Write-off;
// plan of 5.11, decided item 11: write-offs only, until 5.12 opens it to every type). Every role
// that sees the branch reads it (03 "See orders, stock and reports"); another branch, an unknown
// id and a document of another type are the "Not found" page (03 rule 1). The lines show the
// stock of now beside what is to be written off. Approve and Refuse, fixed at the bottom, only
// where the query offers them (`canDecide`: the Head, while it waits); anyone else reads a line
// saying who it waits for. At phone width the lines are cards.

export default async function WriteOffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/warehouse/documents/${encodeURIComponent(id)}`);
  const writeOff = await getWriteOff(user.id, id);
  if (!writeOff || writeOff.status === "IN_TRANSIT" || writeOff.status === "RECEIVED") notFound();
  const t = await getTranslations("warehouse.writeOff");
  const format = await getFormatters();
  const at = (moment: Date) => `${format.date(moment)} ${format.time(moment)}`;
  const quantity = (qty: string, unit: string) => `${format.quantity(qty)} ${unit}`;
  const itemName = (line: (typeof writeOff.lines)[number]) =>
    line.subtypeName ? `${line.productName} · ${line.subtypeName}` : line.productName;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t("page.title", { number: writeOff.number })}
        </h1>
        <WriteOffStatusLabel status={writeOff.status} />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <dl className="grid grid-cols-1 gap-4 text-[15px] leading-[22px] sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm leading-5 font-semibold">{t("page.branch")}</dt>
            <dd>{writeOff.branchCode}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm leading-5 font-semibold">{t("page.date")}</dt>
            <dd>{format.date(writeOff.docDate)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm leading-5 font-semibold">{t("page.reason")}</dt>
            <dd data-reason={writeOff.reason}>{t(`reasons.${writeOff.reason}`)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm leading-5 font-semibold">{t("page.askedBy")}</dt>
            <dd>{t("page.byAt", { name: writeOff.askedBy, at: at(writeOff.askedAt) })}</dd>
          </div>
          {writeOff.decidedBy && writeOff.decidedAt ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm leading-5 font-semibold">{t("page.decidedBy")}</dt>
              <dd>{t("page.byAt", { name: writeOff.decidedBy, at: at(writeOff.decidedAt) })}</dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <dt className="text-sm leading-5 font-semibold">{t("page.comment")}</dt>
            <dd className="break-words whitespace-pre-line">{writeOff.comment}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="write-off-lines"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h2 id="write-off-lines" className="text-[17px] leading-6 font-semibold">
          {t("page.lines")}
        </h2>
        <table className="w-full text-[15px] leading-[22px] max-sm:block">
          <thead className="max-sm:sr-only">
            <tr className="border-b border-border text-left text-sm leading-5 text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t("page.product")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                {t("page.quantity")}
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                {t("page.inStock")}
              </th>
            </tr>
          </thead>
          <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-3">
            {writeOff.lines.map((line) => (
              <tr
                key={line.id}
                data-write-off-line={line.id}
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
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {writeOff.canDecide ? (
        <WriteOffDecision
          documentId={writeOff.id}
          number={writeOff.number}
          lines={writeOff.lines}
        />
      ) : writeOff.status === "PENDING_APPROVAL" ? (
        <p data-write-off-waiting className="text-[15px] leading-[22px] text-muted-foreground">
          {t("page.waiting")}
        </p>
      ) : null}
    </div>
  );
}
