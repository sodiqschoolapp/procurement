import { describe, expect, it } from "vitest";

import { inventedBranch, inventedUser } from "./invented";

// CLAUDE.md, Conventions: "Names, phones and ids in tests, seeds and examples are invented"
// (no spec rule covers test data); 04-catalogs.md: a branch code is 2 to 4 Latin capital letters.
describe("invented users and branches (CLAUDE.md, Conventions)", () => {
  it("makes branch codes of 2 to 4 Latin capital letters (04-catalogs.md)", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(inventedBranch().code).toMatch(/^[A-Z]{2,4}$/);
    }
  });

  it("never repeats a username, a phone or a branch code inside one file", () => {
    const users = Array.from({ length: 200 }, () => inventedUser("MANAGER"));
    const branches = Array.from({ length: 200 }, () => inventedBranch());

    expect(new Set(users.map((user) => user.username)).size).toBe(200);
    expect(new Set(users.map((user) => user.phone)).size).toBe(200);
    expect(new Set(branches.map((branch) => branch.code)).size).toBe(200);
  });

  it("gives the role asked for, an Uzbek default language and an invented phone", () => {
    const user = inventedUser("FINANCE");

    expect(user.role).toBe("FINANCE");
    expect(user.locale).toBe("uz");
    expect(user.phone).toMatch(/^\+998 90 000 \d{2} \d{2}$/);
  });

  it("lets a test choose any field", () => {
    expect(inventedUser("HEAD", { username: "head_one", locale: "ru" })).toMatchObject({
      username: "head_one",
      locale: "ru",
      role: "HEAD",
    });
    expect(inventedBranch({ code: "CHL" }).code).toBe("CHL");
  });
});
