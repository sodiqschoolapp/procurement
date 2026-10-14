// A generated password (02-assumptions.md A8: "the Head types a password or has one generated";
// plan of 1.3, decision 10). Pure: the form passes random bytes from `crypto.getRandomValues`,
// and the server never makes or returns a password. There are no password rules (A8), so a
// generated one only has to be hard to guess and easy to read out: 12 characters from 32 lower-case
// letters and digits without look-alikes (no 0, o, 1, l), 60 bits.

export const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const GENERATED_PASSWORD_LENGTH = 12;

/**
 * Bytes at or above this are skipped, so every character is equally likely. With 32 characters
 * no byte is skipped; the check keeps it true if the alphabet changes.
 */
const LIMIT = 256 - (256 % PASSWORD_ALPHABET.length);

/**
 * A password from random bytes, by rejection sampling: a byte at or above LIMIT is skipped, so
 * every character is equally likely. `randomBytes(n)` returns n fresh random bytes; it is asked
 * again until the password is full.
 */
export function generatePassword(randomBytes: (count: number) => Uint8Array): string {
  let password = "";
  while (password.length < GENERATED_PASSWORD_LENGTH) {
    for (const byte of randomBytes(GENERATED_PASSWORD_LENGTH * 2)) {
      if (byte >= LIMIT) continue;
      password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (password.length === GENERATED_PASSWORD_LENGTH) break;
    }
  }
  return password;
}
