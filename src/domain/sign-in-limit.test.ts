import { describe, expect, it } from "vitest";

import {
  SIGN_IN_TRY_LIMIT,
  SIGN_IN_WINDOW_MINUTES,
  minutesUntil,
  signInOpensAt,
} from "./sign-in-limit";

// developer-rules.md rule 13: "Login allows 5 tries per 15 minutes"; plan of 0.6, decision 5:
// 5 failed tries of one username within 15 minutes lock it until the oldest leaves the window.

const at = (time: string) => new Date(`2026-11-02T${time}Z`);
const failuresAt = (...times: string[]) => times.map(at);

describe("the sign-in limit (developer-rules.md rule 13)", () => {
  it("is 5 tries per 15 minutes", () => {
    expect(SIGN_IN_TRY_LIMIT).toBe(5);
    expect(SIGN_IN_WINDOW_MINUTES).toBe(15);
  });

  it("allows a try after 4 failures", () => {
    expect(
      signInOpensAt(failuresAt("08:00:00", "08:01:00", "08:02:00", "08:03:00"), at("08:04:00")),
    ).toBeNull();
  });

  it("refuses the 6th try after 5 failures, until the oldest is 15 minutes old", () => {
    const failures = failuresAt("08:00:00", "08:01:00", "08:02:00", "08:03:00", "08:04:00");

    expect(signInOpensAt(failures, at("08:10:00"))).toEqual(at("08:15:00"));
    expect(signInOpensAt(failures, at("08:14:59"))).toEqual(at("08:15:00"));
    // The worked example of the plan review: at 08:15:00 the 08:00 failure has left the window.
    expect(signInOpensAt(failures, at("08:15:00"))).toBeNull();
  });

  it("with 6 failures waits until two of them have left", () => {
    const failures = failuresAt(
      "08:00:00",
      "08:01:00",
      "08:02:00",
      "08:03:00",
      "08:04:00",
      "08:05:00",
    );

    expect(signInOpensAt(failures, at("08:15:00"))).toEqual(at("08:16:00"));
    expect(signInOpensAt(failures, at("08:16:00"))).toBeNull();
  });

  it("ignores failures older than the window and the order they come in", () => {
    const failures = failuresAt("08:04:00", "07:00:00", "08:02:00", "08:03:00", "08:01:00");

    expect(signInOpensAt(failures, at("08:10:00"))).toBeNull();
  });

  it("says how many whole minutes are left, rounded up, at least one", () => {
    expect(minutesUntil(at("08:15:00"), at("08:10:00"))).toBe(5);
    expect(minutesUntil(at("08:15:00"), at("08:10:01"))).toBe(5);
    expect(minutesUntil(at("08:15:00"), at("08:14:59"))).toBe(1);
  });
});
