import { describe, expect, it, vi } from "vitest";

import { setClock } from "../../../tests/helpers/clock";
import { insertUser } from "../../../tests/helpers/users";
import { signIn } from "./sign-in";

// Plan of 0.6, decision 6: "the page never tells which usernames exist or are switched off".
// The same text is not enough: an unknown or inactive username must cost a password hash too,
// or the time of the answer gives it away (permission review of 0.6).
const hashed = vi.hoisted(() => ({ count: 0 }));
vi.mock("better-auth/crypto", async (original) => {
  const crypto = await original<typeof import("better-auth/crypto")>();
  return {
    ...crypto,
    hashPassword: async (password: string) => {
      hashed.count += 1;
      return crypto.hashPassword(password);
    },
  };
});

describe("an unknown or inactive username costs a password hash (plan of 0.6, decision 6)", () => {
  it("hashes the typed password for an unknown username", async () => {
    setClock("2031-03-10T04:00:00Z");
    hashed.count = 0;

    expect(await signIn({ username: "invented_nobody", password: "x" })).toEqual({
      ok: false,
      reason: "wrong",
    });
    expect(hashed.count).toBe(1);
  });

  it("hashes the typed password for an inactive user", async () => {
    setClock("2031-03-10T04:00:00Z");
    const finance = await insertUser("FINANCE", { isActive: false });
    hashed.count = 0;

    expect(await signIn({ username: finance.username, password: finance.password })).toEqual({
      ok: false,
      reason: "wrong",
    });
    expect(hashed.count).toBe(1);
  });
});
