import type { Locale } from "@/i18n/locale";

import { HELP_OUTLINE } from "./outline";
import { plainText } from "./text";

// The words of the Help page, one file per language under src/i18n/help/ (plan of 9.7, decided
// item 3): loaded by /help only, never sent with the other pages' messages.

export type HelpTopicText = { title: string; body: string };
export type HelpChapterText = {
  title: string;
  lead: string;
  topics: Record<string, HelpTopicText>;
};
export type HelpFile = { chapters: Record<string, HelpChapterText> };

/** The help file of one language. */
export async function loadHelp(locale: Locale): Promise<HelpFile> {
  const file = (await import(`@/i18n/help/${locale}.json`)) as { default: HelpFile };
  return file.default;
}

/** The chapters and topics in the outline's order, with their words. */
export function helpPage(help: HelpFile) {
  return HELP_OUTLINE.map((chapter) => {
    const words = help.chapters[chapter.id]!;
    return {
      id: chapter.id,
      title: words.title,
      lead: words.lead,
      topics: chapter.topics.map((topic) => ({ id: topic.id, ...words.topics[topic.id]! })),
    };
  });
}

/** A topic's title and body as plain words: what the search reads. */
export function topicText(topic: HelpTopicText): string {
  return `${topic.title} ${plainText(topic.body)}`;
}
