import { describe, expect, it } from "vitest";

import { auditValue, changedFields } from "./audit";
import { SECRET_FIELD_NAMES, refuseSecretFields } from "./audit-secrets.mjs";

// developer-rules.md rule 13 ("Changes to catalogs, users and settings go to an audit log");
// build-plan 1.3, Done when: "the audit row of a renewal holds no password" (plan of 0.9,
// decision 7). 14-data-model.md, System: audit_log `before JSONB, after JSONB`.

describe("auditValue: the secret field names (developer-rules.md rule 13; build-plan 1.3)", () => {
  it("names the five secret fields", () => {
    expect(SECRET_FIELD_NAMES).toEqual(["password", "passwordhash", "hash", "token", "secret"]);
  });

  it.each([
    "password",
    "Password",
    "PASSWORD",
    "passwordHash",
    "password_hash",
    "hash",
    "token",
    "Secret",
  ])("refuses the field %s", (name) => {
    expect(() => auditValue({ fullName: "Invented Person", [name]: "x" })).toThrow(
      `secret field "${name}"`,
    );
  });

  it("refuses a secret field nested in an object and in an array", () => {
    expect(() => auditValue({ account: { password: "x" } })).toThrow('"account.password"');
    expect(() => auditValue({ accounts: [{ ok: 1 }, { Token: "x" }] })).toThrow(
      '"accounts[1].Token"',
    );
  });

  it("lets names that only contain a secret word through", () => {
    expect(auditValue({ passwordRenewedAt: new Date("2031-03-10T04:00:00Z") })).toEqual({
      passwordRenewedAt: "2031-03-10T04:00:00.000Z",
    });
  });

  it("is the same check the SQL writer of audit-row.mjs runs", () => {
    expect(() => refuseSecretFields({ nested: { hash: "x" } })).toThrow('"nested.hash"');
    expect(() => refuseSecretFields(null)).not.toThrow();
  });
});

describe("auditValue: the stored JSON (developer-rules.md rules 6 and 10)", () => {
  it("stores a bigint as its exact decimal text, beyond the safe range of a number", () => {
    expect(auditValue({ price: 9_007_199_254_740_993n, change: -1_250_000n })).toEqual({
      price: "9007199254740993",
      change: "-1250000",
    });
  });

  it("stores a moment as its UTC ISO text", () => {
    expect(auditValue({ at: new Date("2027-01-01T01:30:00+05:00") })).toEqual({
      at: "2026-12-31T20:30:00.000Z",
    });
  });

  it("leaves out undefined fields and keeps null, text, numbers and booleans", () => {
    expect(
      auditValue({ gone: undefined, empty: null, name: "Invented", count: 3, isActive: false }),
    ).toEqual({ empty: null, name: "Invented", count: 3, isActive: false });
  });

  it("converts nested objects and arrays", () => {
    expect(auditValue({ limits: { amount: 5n, days: [1, 2] } })).toEqual({
      limits: { amount: "5", days: [1, 2] },
    });
  });

  it("refuses a number that is not finite and an invalid date", () => {
    expect(() => auditValue({ amount: Number.NaN })).toThrow('"amount"');
    expect(() => auditValue({ at: new Date("not a date") })).toThrow('"at"');
  });
});

describe("changedFields (04-catalogs.md rule 9: who changed what and when)", () => {
  it("finds a changed field and leaves equal ones out", () => {
    expect(
      changedFields(
        { name: "Old", code: "AB", phone: "1" },
        { name: "New", code: "AB", phone: "1" },
      ),
    ).toEqual([{ field: "name", before: "Old", after: "New" }]);
  });

  it("finds added and removed fields, ordered by name", () => {
    expect(changedFields({ zeta: 1, alpha: 2 }, { alpha: 2, beta: 3 })).toEqual([
      { field: "beta", before: null, after: 3 },
      { field: "zeta", before: 1, after: null },
    ]);
  });

  it("lists every field of a create", () => {
    expect(changedFields(null, { role: "HEAD", isActive: true })).toEqual([
      { field: "isActive", before: null, after: true },
      { field: "role", before: null, after: "HEAD" },
    ]);
  });

  it("finds none for equal records, whatever the order of an object's keys", () => {
    expect(changedFields({ a: { x: 1, y: [1, 2] } }, { a: { y: [1, 2], x: 1 } })).toEqual([]);
    expect(changedFields({ a: [1, 2] }, { a: [2, 1] })).toEqual([
      { field: "a", before: [1, 2], after: [2, 1] },
    ]);
  });
});
