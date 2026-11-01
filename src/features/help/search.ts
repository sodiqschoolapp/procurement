// The search of the Help page (11-screens-and-ux.md, Help page rule 3: "One search box narrows the
// page to the topics that hold every word typed"; plan of 9.7, decided item 6). It runs in the
// browser over the text the page already shows, so a visitor's search makes no request.

/** Apostrophes in every form a keyboard gives, the Uzbek letters oʻ and gʻ among them. */
const APOSTROPHES = /['‘’ʻʼ`]/gu;

/** A text as the search compares it: lower case, no apostrophes, single spaces. */
export function searchable(text: string): string {
  return text.toLocaleLowerCase().replace(APOSTROPHES, "").replace(/\s+/gu, " ").trim();
}

/** The words of what was typed, as the search compares them; none for an empty box. */
export function searchWords(typed: string): string[] {
  const text = searchable(typed);
  return text === "" ? [] : text.split(" ");
}

/** Whether a topic's text holds every word; every topic matches when no word was typed. */
export function topicMatches(topicText: string, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const text = searchable(topicText);
  return words.every((word) => text.includes(word));
}
