// The browser-made id of a create action (developer-rules.md rule 8, "Safe repeats"): a form
// makes one key when it opens and sends the same key with every try, so a save repeated over a
// bad connection returns the first result instead of buying twice. The server stores it in a
// `uuid UNIQUE` column (docs/decisions.md, 0.4) and checks it with isClientKey.

export type ClientKey = string;

/** A UUID version 4, lower case, as `crypto.randomUUID()` writes it. */
export const CLIENT_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A new key. Web Crypto: in every browser on https or 127.0.0.1, and in Node. */
export function newClientKey(): ClientKey {
  return globalThis.crypto.randomUUID();
}

export function isClientKey(value: unknown): value is ClientKey {
  return typeof value === "string" && CLIENT_KEY_PATTERN.test(value);
}
