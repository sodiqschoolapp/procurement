"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { markAddedCheckedAction } from "@/app/(app)/home-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { useFormatters } from "@/i18n/use-formatters";

// The Head's home list of products and subtypes added by Managers, until checked (04-catalogs.md
// rule 8; 10, Home page per role: Head; plan of 1.12b). Each row links to its catalog page and has
// a tick box; ticked rows bring up the selection bar of docs/design-system.md with the count,
// "Clear" and "Mark checked", which asks first with the count (11 rule 6). The server decides.

export type AddedRow = {
  kind: "product" | "subtype";
  id: string;
  productId: string;
  name: string;
  productName: string | null;
  addedByName: string;
  /** ISO text of the moment it was added. */
  createdAt: string;
};

export function AddedByManagers({ rows }: { rows: readonly AddedRow[] }) {
  const t = useTranslations("home.head.added");
  const router = useRouter();
  const format = useFormatters();
  const action = useAction(markAddedCheckedAction);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState(false);

  const shown = rows.filter((row) => ticked.has(row.id));

  function tick(id: string, on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirm() {
    try {
      const result = await action.run({
        productIds: shown.filter((row) => row.kind === "product").map((row) => row.id),
        subtypeIds: shown.filter((row) => row.kind === "subtype").map((row) => row.id),
      });
      if (!result) return;
      if (!result.ok) {
        toast.error(action.errorText ?? t("failed"));
        return;
      }
      toast.success(t("marked", { count: shown.length }));
      setTicked(new Set());
    } finally {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => {
          const href =
            row.kind === "product"
              ? `/catalog/products/${row.id}`
              : `/catalog/products/${row.productId}/subtypes/${row.id}`;
          const title =
            row.kind === "product"
              ? row.name
              : t("subtype", { name: row.name, product: row.productName ?? "" });
          return (
            <li key={row.id} data-added={row.kind} className="flex items-center gap-2 py-1">
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  checked={ticked.has(row.id)}
                  onChange={(event) => tick(row.id, event.target.checked)}
                  aria-label={t("tick", { name: title })}
                  className="size-5 accent-primary sm:size-4"
                />
              </label>
              <Link href={href} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-sm leading-5 font-semibold">{title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t(row.kind === "product" ? "productLine" : "subtypeLine", {
                    name: row.addedByName,
                    date: format.date(new Date(row.createdAt)),
                  })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {shown.length > 0 && (
        <section
          aria-live="polite"
          data-added-bar
          className="sticky bottom-4 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-strong bg-card p-3 shadow-float max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
        >
          <span className="text-subheading">{t("count", { count: shown.length })}</span>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            <Button type="button" onClick={() => setOpen(true)} className="max-sm:flex-1">
              {t("mark")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
              {t("clear")}
            </Button>
          </div>
        </section>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={action.pending}
        onConfirm={() => void confirm()}
        text={{
          title: t("confirmTitle", { count: shown.length }),
          result: t("confirmResult", { count: shown.length }),
          confirm: t("mark"),
        }}
      />
    </>
  );
}
