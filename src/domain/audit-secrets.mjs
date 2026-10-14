// The field names an audit row never holds (developer-rules.md rule 13; build-plan 1.3, Done
// when: "the audit row of a renewal holds no password"). Plain .mjs with JSDoc types, so the
// first-Head script reaches it with Node.js alone (decisions 0.2: no tsx) and src/domain/audit.ts
// and src/server/audit-row.mjs share the one list (review of the plan of 0.9, correction 1).
// Pure: no import at all.

/** Compared in lower case, without `_` and `-`: `passwordHash`, `password_hash`, `PASSWORD`. */
export const SECRET_FIELD_NAMES = ["password", "passwordhash", "hash", "token", "secret"];

/** @param {string} name */
function isSecretName(name) {
  return SECRET_FIELD_NAMES.includes(name.replace(/[_-]/g, "").toLowerCase());
}

/**
 * Throws when a field anywhere in the value, at any depth and inside arrays, has a secret name.
 * @param {unknown} value
 * @param {string} [path]
 * @returns {void}
 */
export function refuseSecretFields(value, path = "") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => refuseSecretFields(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object" || value instanceof Date) return;
  for (const [name, inner] of Object.entries(value)) {
    const at = path ? `${path}.${name}` : name;
    if (isSecretName(name)) {
      throw new Error(`Refused: the audit row would hold the secret field "${at}".`);
    }
    refuseSecretFields(inner, at);
  }
}
