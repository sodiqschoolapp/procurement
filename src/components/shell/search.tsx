"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { type WireSearchResults, searchAction } from "@/app/(app)/search-actions";
import { Icon } from "@/components/icon";
import { Skeleton } from "@/components/skeleton";
import { RequestStatusLabel } from "@/components/status-label";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { SEARCH_MIN_LENGTH, SEARCH_WAIT_MS } from "@/domain/search";

// The search of the top bar (11-screens-and-ux.md rule 9: "Ctrl+K or Cmd+K opens a search for
// order numbers, products and suppliers"; docs/design-system.md, Top bar: "the search field with
// 'Ctrl K' as plain text at its right", Phone width: a search button; plan of 6.10). The button
// sits in the place 0.10b kept (decided item 7). The dialog asks the server 250 ms after the last
// key, from 2 characters; an older answer that comes after a newer question is dropped. Arrow
// keys move through the results of the three groups, Enter opens one, Escape closes (rule 13);
// the count is announced. Grey placeholders while a search runs (rule 5).

type Hit = { key: string; href: string };

/** The results in the order the arrow keys walk them: orders, products, suppliers. */
function hitsOf(results: WireSearchResults | null): Hit[] {
  if (!results) return [];
  return [
    ...results.orders.map((row) => ({ key: `order-${row.id}`, href: row.href })),
    ...results.products.map((row) => ({ key: `product-${row.id}`, href: row.href })),
    ...results.suppliers.map((row) => ({ key: `supplier-${row.id}`, href: row.href })),
  ];
}

/** The window event that opens the search from another place on the page. */
export const OPEN_SEARCH_EVENT = "procurement:open-search";

/** Opens the search of the top bar, as Ctrl+K does. */
export function openSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/** Ctrl+K, or Cmd+K on a Mac, without another modifier. */
export function isSearchShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

export function Search() {
  const t = useTranslations("search");
  const tCatalog = useTranslations("catalog");
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  /** The newest answer and the text it answers; another text's answer is never shown as this one's. */
  const [answer, setAnswer] = useState<{ query: string; results: WireSearchResults } | null>(null);
  const [active, setActive] = useState(0);
  const asked = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      setOpen(true);
    }
    // A search field elsewhere on the page (the order list's filter bar) opens this same search.
    function onOpenSearch() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
    };
  }, []);

  const query = text.trim();
  const enough = query.length >= SEARCH_MIN_LENGTH;

  useEffect(() => {
    const ask = ++asked.current;
    if (!open || !enough) return;
    const timer = setTimeout(async () => {
      let found: WireSearchResults = { orders: [], products: [], suppliers: [] };
      try {
        const result = await searchAction({ q: query });
        if (result.ok) found = result.data;
      } finally {
        // An older answer after a newer question is dropped.
        if (ask === asked.current) {
          setActive(0);
          setAnswer({ query, results: found });
        }
      }
    }, SEARCH_WAIT_MS);
    return () => clearTimeout(timer);
  }, [open, enough, query]);

  // The results stand only for the text typed now: during the pause and while the question runs
  // the placeholders show, never an earlier text's results or "Nothing found".
  const results = enough && answer?.query === query ? answer.results : null;
  const loading = enough && results === null;
  const hits = hitsOf(results);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setText("");
      setAnswer(null);
    }
  }

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((at) => Math.min(at + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) => Math.max(at - 1, 0));
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      go(hits[active]!.href);
    }
  }

  const nameOf = (row: { productName: string; subtypeName: string | null }) =>
    row.subtypeName
      ? t("subtyped", { product: row.productName, subtype: row.subtypeName })
      : row.productName;

  const optionId = (key: string) => `${listId}-${key}`;
  const activeKey = hits[active]?.key;

  function option(hitKey: string, href: string, children: React.ReactNode) {
    const at = hits.findIndex((hit) => hit.key === hitKey);
    return (
      <li key={hitKey} role="presentation">
        <Link
          id={optionId(hitKey)}
          role="option"
          aria-selected={hitKey === activeKey}
          href={href}
          tabIndex={-1}
          onClick={() => onOpenChange(false)}
          onMouseMove={() => setActive(at)}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm leading-5",
            hitKey === activeKey && "bg-accent",
          )}
        >
          {children}
        </Link>
      </li>
    );
  }

  function group(name: "orders" | "products" | "suppliers", children: React.ReactNode) {
    const headingId = `${listId}-${name}`;
    return (
      <li role="presentation" className="mt-2 first:mt-0">
        <p id={headingId} className="px-3 py-1 text-xs font-semibold text-muted-foreground">
          {t(`groups.${name}`)}
        </p>
        <ul role="group" aria-labelledby={headingId}>
          {children}
        </ul>
      </li>
    );
  }

  const count = hits.length;
  let status: string;
  if (!enough) status = t("hint", { count: SEARCH_MIN_LENGTH });
  else if (!results) status = t("loading");
  else status = count === 0 ? t("empty") : t("found", { count });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        aria-label={t("open")}
        data-testid="search-open"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "sm:h-9 sm:w-64 sm:justify-start sm:border sm:border-border-strong sm:bg-muted sm:px-3 sm:font-normal sm:text-muted-foreground sm:hover:bg-accent",
        )}
      >
        <Icon name="search" />
        <span className="hidden flex-1 text-left sm:inline">{t("placeholder")}</span>
        {/* Drawn by CSS, so the shortcut stays out of the button's name (WCAG 2.5.3; plan of 9.1d). */}
        <span
          aria-hidden="true"
          data-shortcut={t("shortcut")}
          className="hidden text-xs after:content-[attr(data-shortcut)] sm:inline"
        />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] transition-opacity duration-160 ease-out",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed top-4 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 sm:top-24",
            "rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-float",
            "transition-[opacity,scale] duration-160 ease-out",
            "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
          )}
        >
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              role="combobox"
              aria-label={t("title")}
              aria-expanded={count > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeKey ? optionId(activeKey) : undefined}
              autoComplete="off"
              autoFocus
              type="search"
              placeholder={t("placeholder")}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onInputKeyDown}
              className="pl-10"
            />
          </div>
          <p aria-live="polite" className="px-3 pt-3 pb-1 text-sm text-muted-foreground">
            {status}
          </p>
          {enough && loading && (
            <div aria-busy="true" className="flex flex-col gap-2 px-3 py-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          )}
          {results && count > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label={t("title")}
              className="max-h-[60vh] overflow-y-auto"
            >
              {results.orders.length > 0 &&
                group(
                  "orders",
                  results.orders.map((row) =>
                    option(
                      `order-${row.id}`,
                      row.href,
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold tabular-nums">
                            {t("orderNumber", { number: row.number, revision: row.revision })}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            {t("inBranch", { name: nameOf(row), branch: row.branchCode })}
                          </span>
                        </span>
                        <RequestStatusLabel status={row.status} />
                      </>,
                    ),
                  ),
                )}
              {results.products.length > 0 &&
                group(
                  "products",
                  results.products.map((row) =>
                    option(
                      `product-${row.id}`,
                      row.href,
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {row.isActive ? nameOf(row) : t("inactive", { name: nameOf(row) })}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {row.type === "SERVICE"
                            ? t("service", {
                                category: row.categoryName,
                                type: tCatalog("productType.SERVICE"),
                              })
                            : row.categoryName}
                        </span>
                      </span>,
                    ),
                  ),
                )}
              {results.suppliers.length > 0 &&
                group(
                  "suppliers",
                  results.suppliers.map((row) =>
                    option(
                      `supplier-${row.id}`,
                      row.href,
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {row.isActive ? row.name : t("inactive", { name: row.name })}
                      </span>,
                    ),
                  ),
                )}
            </ul>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
