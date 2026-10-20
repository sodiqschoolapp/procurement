"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { searchDraftProductsAction } from "@/app/(app)/orders/actions";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/utils";
import type { WireProduct, WireSubtype } from "@/features/orders/draft-wire";
import { useFormatters } from "@/i18n/use-formatters";

// The product cell of the drafts grid (05-order-request-form.md field 2: "search by name, shows
// photo, category and stock"; 11-screens-and-ux.md rule 2: "Typing in the product cell opens the
// search with photo, name, category and stock"). A combobox: each hit is one subtype of a
// product, so one pick names the product and its subtype (field 3) together. Arrow keys move,
// Enter picks, Escape closes (rule 13).

export type PickedSubtype = { product: WireProduct; subtype: WireSubtype };

const SEARCH_DELAY_MS = 250;

export function ProductPicker({
  branchId,
  shown,
  onPick,
  disabled = false,
  invalid = false,
  label,
  id,
}: {
  branchId: string | null;
  /** The text of the cell when nothing is typed: the product (and subtype) of the row. */
  shown: string;
  onPick(picked: PickedSubtype): void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  id?: string;
}) {
  const t = useTranslations("orders");
  const tCatalog = useTranslations("catalog");
  const format = useFormatters();
  const listId = useId();
  const [text, setText] = useState(shown);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<PickedSubtype[]>([]);
  const [active, setActive] = useState(0);
  const asked = useRef(0);

  useEffect(() => {
    if (!open || !branchId) return;
    const ask = ++asked.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await searchDraftProductsAction({ branchId, q: text === shown ? "" : text });
      if (ask !== asked.current) return;
      setLoading(false);
      setActive(0);
      setHits(
        result.ok
          ? result.data.flatMap((product) =>
              product.subtypes.map((subtype) => ({ product, subtype })),
            )
          : [],
      );
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, open, branchId, shown]);

  function pick(hit: PickedSubtype) {
    setOpen(false);
    setText(shown);
    onPick(hit);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((at) => Math.min(at + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) => Math.max(at - 1, 0));
    } else if (event.key === "Enter" && open && hits[active]) {
      // The pick is this Enter's whole job: the grid does not move on it (plan of 2.6).
      event.preventDefault();
      event.stopPropagation();
      pick(hits[active]!);
    } else if (event.key === "Escape") {
      setOpen(false);
      setText(shown);
    }
  }

  const optionId = (at: number) => `${listId}-${at}`;

  return (
    <div className="relative min-w-56">
      <Input
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-activedescendant={open && hits[active] ? optionId(active) : undefined}
        autoComplete="off"
        placeholder={t("picker.placeholder")}
        value={open ? text : shown}
        disabled={disabled || !branchId}
        onFocus={(event) => {
          event.target.select();
          setText(shown);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setText(shown);
        }}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          aria-busy={loading || undefined}
          className="absolute top-full left-0 z-40 mt-1 max-h-80 w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-popover p-1 text-popover-foreground shadow-float max-sm:w-full"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t(loading ? "picker.loading" : "picker.empty")}
            </li>
          ) : (
            hits.map((hit, at) => (
              <li
                key={hit.subtype.id}
                id={optionId(at)}
                role="option"
                aria-selected={at === active}
                // Picked on mouse down, before the field's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(hit);
                }}
                onMouseEnter={() => setActive(at)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
                  at === active && "bg-accent",
                )}
              >
                <Thumb fileId={hit.subtype.photoFileId} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm leading-5 font-semibold">
                    {hit.subtype.name
                      ? `${hit.product.name} — ${hit.subtype.name}`
                      : hit.product.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      hit.product.categoryName,
                      tCatalog(`productType.${hit.product.type}`),
                      hit.subtype.inStock === null
                        ? t("picker.noStock")
                        : t("picker.stock", {
                            stock: `${format.quantity(hit.subtype.inStock)} ${hit.product.unitShortName}`,
                          }),
                    ].join(" · ")}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** A small photo, or the placeholder of none (05 field 5). */
export function Thumb({ fileId, alt = "" }: { fileId: string | null; alt?: string }) {
  const t = useTranslations("orders.photo");
  if (!fileId) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name="inventory_2" size={18} />
        <span className="sr-only">{t("none")}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
    <img
      src={`/files/${fileId}/small`}
      alt={alt}
      width={40}
      height={40}
      className="size-10 shrink-0 rounded-lg bg-muted object-cover"
    />
  );
}
