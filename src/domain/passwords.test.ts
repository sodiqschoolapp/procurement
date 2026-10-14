import { describe, expect, it } from "vitest";

import { GENERATED_PASSWORD_LENGTH, PASSWORD_ALPHABET, generatePassword } from "./passwords";

// 02-assumptions.md A8: "the Head types a password or has one generated"; plan of 1.3, decision 10.

function bytesFrom(values: number[]) {
  let at = 0;
  return (count: number) => {
    const out = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) {
      out[index] = values[at % values.length]!;
      at += 1;
    }
    return out;
  };
}

describe("generatePassword (A8, plan of 1.3 decision 10)", () => {
  it("makes 12 characters of the alphabet, which has no look-alikes", () => {
    const password = generatePassword((count) => crypto.getRandomValues(new Uint8Array(count)));
    expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    for (const character of password) expect(PASSWORD_ALPHABET).toContain(character);
    for (const lookAlike of ["0", "o", "1", "l", "O", "I"]) {
      expect(PASSWORD_ALPHABET).not.toContain(lookAlike);
    }
    expect(new Set(PASSWORD_ALPHABET).size).toBe(PASSWORD_ALPHABET.length);
  });

  it("takes every character from the bytes it is given", () => {
    expect(generatePassword(bytesFrom([0, 1, 2]))).toBe("abcabcabcabc");
    expect(generatePassword(bytesFrom([PASSWORD_ALPHABET.length + 1]))).toBe("bbbbbbbbbbbb");
  });

  it("gives each character the same chance: every byte value maps to one character evenly", () => {
    const counts = new Map<string, number>();
    for (let byte = 0; byte < 256; byte += 1) {
      const character = generatePassword(bytesFrom([byte])).charAt(0);
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
    expect(counts.size).toBe(PASSWORD_ALPHABET.length);
    expect(new Set(counts.values()).size).toBe(1);
  });
});
