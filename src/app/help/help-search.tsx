"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { searchWords, topicMatches } from "@/features/help/search";

// The search box of the Help page (11-screens-and-ux.md, Help page rule 3; plan of 9.7, decided
// item 6). It hides, in the page the server rendered, every topic (data-help-topic) whose words do
// not hold every word typed, and every chapter left with no topic. The matching words are
// marked with the CSS Custom Highlight API where the browser has it; nothing is sent anywhere.

const HIGHLIGHT = "help-search";

type Highlights = { set(name: string, value: unknown): void; delete(name: string): void };

function highlights(): Highlights | undefined {
  return (CSS as unknown as { highlights?: Highlights }).highlights;
}

function mark(topics: HTMLElement[], words: string[]) {
  const registry = highlights();
  const HighlightClass = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown })
    .Highlight;
  if (!registry || !HighlightClass) return;
  registry.delete(HIGHLIGHT);
  if (words.length === 0) return;
  const ranges: Range[] = [];
  for (const topic of topics) {
    const walker = document.createTreeWalker(topic, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.nodeValue ?? "").toLocaleLowerCase();
      for (const word of words) {
        for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
          const range = new Range();
          range.setStart(node, at);
          range.setEnd(node, at + word.length);
          ranges.push(range);
        }
      }
    }
  }
  registry.set(HIGHLIGHT, new HighlightClass(...ranges));
}

/** Shows the topics and chapters that hold every word typed; the number shown, or null. */
function filter(typed: string): number | null {
  const words = searchWords(typed);
  const topics = [...document.querySelectorAll<HTMLElement>("[data-help-topic]")];
  let shown = 0;
  for (const topic of topics) {
    const matches = topicMatches(topic.textContent ?? "", words);
    topic.hidden = !matches;
    if (matches) shown += 1;
  }
  for (const chapter of document.querySelectorAll<HTMLElement>("[data-help-chapter]")) {
    chapter.hidden = chapter.querySelector("[data-help-topic]:not([hidden])") === null;
  }
  for (const link of document.querySelectorAll<HTMLElement>("[data-help-link]")) {
    const chapter = document.getElementById(link.dataset.helpLink ?? "");
    link.classList.toggle("opacity-40", Boolean(chapter?.hidden));
  }
  mark(
    topics.filter((topic) => !topic.hidden),
    words,
  );
  return words.length === 0 ? null : shown;
}

export function HelpSearch() {
  const t = useTranslations("help");
  const [typed, setTyped] = useState("");
  const [count, setCount] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-1.5" role="search">
      <label htmlFor="help-search" className="sr-only">
        {t("searchLabel")}
      </label>
      <div className="relative">
        <Icon
          name="search"
          size={20}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="help-search"
          type="search"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setCount(filter(event.target.value));
          }}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="pl-10"
        />
      </div>
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {count === null ? "" : count === 0 ? t("none") : t("matches", { count })}
      </p>
    </div>
  );
}
