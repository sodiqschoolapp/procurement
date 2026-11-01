import { describe, expect, it } from "vitest";

import en from "@/i18n/help/en.json" with { type: "json" };
import ru from "@/i18n/help/ru.json" with { type: "json" };
import uz from "@/i18n/help/uz.json" with { type: "json" };
import messages from "@/i18n/messages/en.json" with { type: "json" };

import type { HelpFile } from "./content";
import { topicText } from "./content";
import {
  appScreens,
  coveredBy,
  labelsOf,
  requiredItems,
  uncovered,
  unknownItems,
} from "./coverage";
import { HELP_OUTLINE, helpTopics } from "./outline";
import { searchable } from "./search";

// 11-screens-and-ux.md, Help page rule 2: "It covers every screen, every status and move, every
// permission and Manager right, every setting, every notification, every warehouse document and
// every kind of money row, and the situations of the edge-cases/ files as common questions … a
// test fails when one of these has no help entry"; S26; build-plan 9.7, Build 5 and Done when.

const FILES: Record<string, HelpFile> = { uz, ru, en };

describe("the Help page covers everything (11 Help page rule 2; S26)", () => {
  it("every item of the code and every edge-case situation has a help topic", () => {
    expect(uncovered(HELP_OUTLINE)).toEqual([]);
  });

  it("names no item the code does not have", () => {
    expect(unknownItems(HELP_OUTLINE)).toEqual([]);
  });

  it("fails when one help entry is removed (9.7, Done when)", () => {
    const without = HELP_OUTLINE.map((chapter) => ({
      ...chapter,
      topics: chapter.topics.map((topic) =>
        topic.id === "statuses"
          ? { ...topic, covers: topic.covers?.filter((item) => item !== "status:SETTLEMENT") }
          : topic,
      ),
    }));
    expect(uncovered(without)).toEqual(["status:SETTLEMENT"]);
  });

  it("reads every page of the app, the Help page among them", () => {
    const screens = appScreens();
    expect(screens).toContain("/help");
    expect(screens).toContain("/orders/[id]");
    expect(screens).not.toContain("/[...missing]");
    expect(requiredItems()).toContain("situation:requests-and-approval:1");
  });

  it("each covering topic's English words hold the item's on-screen label (decided item 2)", () => {
    const words = new Map(
      helpTopics().map(({ chapter, topic }) => [
        topic.id,
        searchable(
          topicText(en.chapters[chapter as keyof typeof en.chapters].topics[topic.id as never]),
        ),
      ]),
    );
    const missing: string[] = [];
    for (const [item, topics] of coveredBy(HELP_OUTLINE)) {
      for (const label of labelsOf(item, messages)) {
        if (!topics.some((topic) => words.get(topic)?.includes(searchable(label)))) {
          missing.push(`${item}: "${label}" in none of ${topics.join(", ")}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("the outline and the three help files agree (11 rule 14)", () => {
  it("topic and chapter ids are unique", () => {
    const ids = [
      ...HELP_OUTLINE.map((chapter) => chapter.id),
      ...helpTopics().map(({ topic }) => topic.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const [language, file] of Object.entries(FILES)) {
    it(`${language}: every chapter and topic of the outline, and nothing else, with words`, () => {
      expect(Object.keys(file.chapters)).toEqual(HELP_OUTLINE.map((chapter) => chapter.id));
      for (const chapter of HELP_OUTLINE) {
        const words = file.chapters[chapter.id]!;
        expect(words.title.trim(), chapter.id).not.toBe("");
        expect(Object.keys(words.topics), chapter.id).toEqual(
          chapter.topics.map((topic) => topic.id),
        );
        for (const topic of chapter.topics) {
          expect(words.topics[topic.id]!.title.trim(), topic.id).not.toBe("");
          expect(words.topics[topic.id]!.body.trim(), topic.id).not.toBe("");
        }
      }
    });
  }
});
