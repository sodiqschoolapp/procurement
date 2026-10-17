import { describe, expect, it } from "vitest";

import { MOVEMENT_TYPES } from "@/domain/stock";

import en from "../../i18n/messages/en.json";
import ru from "../../i18n/messages/ru.json";
import uz from "../../i18n/messages/uz.json";

// Every movement type of the item card has its label in uz, ru and en (11-screens-and-ux.md
// rule 14; 09-warehouse.md, Direct entry 2: "appears in the item card marked 'Direct entry'";
// review of the plan of 5.3, correction 3).

describe("warehouse.item.types: one label per movement type in each language", () => {
  for (const [locale, messages] of Object.entries({ uz, ru, en })) {
    it(`${locale} labels exactly the types of MOVEMENT_TYPES`, () => {
      const labels: Record<string, string> = messages.warehouse.item.types;
      expect(Object.keys(labels).sort()).toEqual([...MOVEMENT_TYPES].sort());
      for (const type of MOVEMENT_TYPES) expect(labels[type]?.trim()).toBeTruthy();
    });
  }

  it('labels DIRECT_ENTRY "Direct entry" in English (09 Direct entry 2)', () => {
    expect(en.warehouse.item.types.DIRECT_ENTRY).toBe("Direct entry");
  });
});
