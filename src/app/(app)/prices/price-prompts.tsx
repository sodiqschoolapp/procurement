"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";

import { addPriceAction } from "./actions";

// The price prompts on /prices (04-catalogs.md rule 4: "the Head sees a prompt to update it in one
// click"; plan of 3.10). One row per subtype and branch, as getPricePrompts() returns it; the
// numbers come formatted from the page, the average also as whole so'm for the action. The button
// is the one click: addPrice with the average and a note from the message files (decided item 11),
// one client key per row until it is saved (developer-rules.md rule 8; decided item 13). At phone
// width each row is a card with the button full width; from `sm` a row of the table.

export type PromptRow = {
  key: string;
  variantId: string;
  title: string;
  branchCode: string;
  referenceText: string;
  averageText: string;
  /** Whole so'm as text: what addPrice is sent. */
  average: string;
  count: number;
  percent: number;
};

function SetButton({ row }: { row: PromptRow }) {
  const t = useTranslations("prices");
  const tAll = useTranslations();
  const router = useRouter();
  const action = useAction(addPriceAction, { create: true });

  const onClick = async () => {
    const result = await action.run({
      variantId: row.variantId,
      price: row.average,
      note: t("prompt.note", { count: row.count, branch: row.branchCode }),
    });
    if (!result) return;
    if (!result.ok) {
      toast.error(tAll(result.error.messageKey));
      return;
    }
    toast.success(t("saved"));
    router.refresh();
  };

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={action.pending}
      aria-busy={action.pending}
      className="w-full tabular-nums sm:w-auto"
    >
      {t("prompt.set", { price: row.averageText })}
    </Button>
  );
}

export function PricePrompts({ rows }: { rows: readonly PromptRow[] }) {
  const t = useTranslations("prices");
  return (
    <section
      aria-labelledby="price-prompts-title"
      data-price-prompts
      className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground"
    >
      <div className="flex flex-col gap-1">
        <h2 id="price-prompts-title" className="text-[17px] leading-6 font-bold">
          {t("prompt.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("prompt.line")}</p>
      </div>

      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.key} data-price-prompt className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="font-semibold">{row.title}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm leading-5">
              <dt className="text-muted-foreground">{t("prompt.branch")}</dt>
              <dd>{row.branchCode}</dd>
              <dt className="text-muted-foreground">{t("current")}</dt>
              <dd className="tabular-nums">{row.referenceText}</dd>
              <dt className="text-muted-foreground">{t("prompt.average")}</dt>
              <dd className="tabular-nums">
                {row.averageText}
                <span className="block text-[13px] leading-[18px] text-muted-foreground">
                  {t("prompt.purchases", { count: row.count })}
                </span>
              </dd>
              <dt className="text-muted-foreground">{t("prompt.difference")}</dt>
              <dd className="font-semibold tabular-nums">
                {t("prompt.percent", { percent: row.percent })}
              </dd>
            </dl>
            <SetButton row={row} />
          </li>
        ))}
      </ul>

      <div className="-mx-6 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm leading-5">
          <thead className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
            <tr>
              <th scope="col" className="px-6 py-2">
                {t("product")}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("prompt.branch")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("current")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("prompt.average")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("prompt.difference")}
              </th>
              <th scope="col" className="px-6 py-2">
                <span className="sr-only">{t("newPrice")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-price-prompt className="border-t">
                <td className="px-6 py-3 font-semibold">{row.title}</td>
                <td className="px-3 py-3">{row.branchCode}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                  {row.referenceText}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                  {row.averageText}
                  <span className="block text-[13px] leading-[18px] text-muted-foreground">
                    {t("prompt.purchases", { count: row.count })}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                  {t("prompt.percent", { percent: row.percent })}
                </td>
                <td className="px-6 py-3 text-right">
                  <SetButton row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
