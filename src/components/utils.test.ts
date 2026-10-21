import { describe, expect, it } from "vitest";

import { cn } from "./utils";

// docs/design-system.md, Type: the app's own sizes are font sizes, so merging keeps a size beside
// a colour and lets a later size replace an earlier one.
describe("cn with the type scale (design system, Type)", () => {
  it("keeps a size of the scale beside a colour", () => {
    expect(cn("text-small", "text-destructive")).toBe("text-small text-destructive");
    expect(cn("text-title", "text-muted-foreground")).toBe("text-title text-muted-foreground");
  });

  it("a later size replaces an earlier one", () => {
    expect(cn("text-small", "text-xs")).toBe("text-xs");
    expect(cn("text-sm", "text-heading")).toBe("text-heading");
  });
});
