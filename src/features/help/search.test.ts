import { describe, expect, it } from "vitest";

import { searchWords, searchable, topicMatches } from "./search";

// 11-screens-and-ux.md, Help page rule 3: one search box narrows the page to the topics that hold
// every word typed (plan of 9.7, decided item 6).

describe("the Help search (11 Help page rule 3)", () => {
  it("keeps a topic only when it holds every word typed", () => {
    const text = "Write-off. The Head approves a write-off before stock goes down.";
    expect(topicMatches(text, searchWords("write-off head"))).toBe(true);
    expect(topicMatches(text, searchWords("write-off finance"))).toBe(false);
  });

  it("ignores capital letters, extra spaces and the Uzbek apostrophes", () => {
    expect(searchWords("  Hisobdan   CHIQARISH ")).toEqual(["hisobdan", "chiqarish"]);
    expect(topicMatches("Buyurtma soʻm bilan", searchWords("so'm"))).toBe(true);
    expect(topicMatches("Списание товара", searchWords("СПИСАНИЕ"))).toBe(true);
    expect(searchable("Oʻzbekcha  ‘matn’")).toBe("ozbekcha matn");
  });

  it("matches every topic while the box is empty", () => {
    expect(searchWords("   ")).toEqual([]);
    expect(topicMatches("anything", [])).toBe(true);
  });
});
