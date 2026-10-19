// The translation check (15-quality-and-acceptance.md, Done-check: "No translation key is
// missing in Uzbek, Russian or English"; 11-screens-and-ux.md rule 14). Every key of the three
// message files must be in all three, and every value must be a text that is not empty
// (decisions 0.5 item 8). Since 8.4 the three must also agree, value by value (plan of 8.4,
// decided items 2 and 3): the same arguments, tags and select options; no `#` outside a plural;
// a plural complete for its language; each language in its own script; one Uzbek apostrophe.
// `npm run i18n:check`; CI runs it in the job `checks`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MESSAGES_FOLDER = fileURLToPath(new URL("../src/i18n/messages", import.meta.url));
export const LANGUAGES = ["uz", "ru", "en"];

/**
 * Keys whose value is the same name in every language, or the spec's literal, so the script
 * checks leave them alone (plan of 8.4, spec review Should fix 1): each language names itself in
 * its own script, and the currency word is `so'm` as 11-screens-and-ux.md rule 10 writes it
 * (plan of 8.4, decided item 1).
 */
export const SCRIPT_EXEMPT = new Set([
  "languages.uz",
  "languages.ru",
  "languages.en",
  "login.logo",
  "format.currency",
  "search.shortcut",
  "orders.list.filters.numberPlaceholder",
  "analytics.excel",
]);

const CYRILLIC = /[Ѐ-ӿ]/u;
const LETTER = /\p{L}/u;
// An apostrophe between two letters, in any of the forms a keyboard or an editor gives.
const APOSTROPHE_BETWEEN_LETTERS = /(?<=(\p{L}))['‘’ʻʼ`](?=\p{L})/gu;

/**
 * Uzbek apostrophes in the official Latin form (plan of 8.4, decided item 3): after o or g the
 * letter oʻ/gʻ (U+02BB), after any other letter the tutuq belgisi (U+02BC). Only an apostrophe
 * between two letters changes, so a quotation mark stays as it is.
 */
export function uzbekApostrophes(text) {
  return text.replace(APOSTROPHE_BETWEEN_LETTERS, (_, before) =>
    /[oOgG]/.test(before) ? "ʻ" : "ʼ",
  );
}

class MessageError extends Error {}

/**
 * Reads one ICU message as next-intl does: its arguments (`{name}`, `{name, kind, …}`), its
 * tags (`<name>…</name>`), the options of each plural and select, and its literal text. Throws
 * a MessageError on a message that is not valid. `hashOutside` is true when a `#` stands outside
 * every plural, where it shows as a literal `#`.
 */
export function readMessage(message) {
  const found = { args: new Map(), choices: [], text: "", hashOutside: false };
  let at = 0;

  const skipSpace = () => {
    while (at < message.length && /\s/u.test(message[at])) at += 1;
  };
  const word = () => {
    skipSpace();
    const start = at;
    while (at < message.length && /[^\s,{}]/u.test(message[at])) at += 1;
    const read = message.slice(start, at);
    skipSpace();
    return read;
  };

  // Literal text up to the `}` that closes the current option (or the end at depth 0).
  const text = (inPlural, depth, tag) => {
    while (at < message.length) {
      const char = message[at];
      if (char === "'") {
        const next = message[at + 1];
        if (next === "'") {
          found.text += "'";
          at += 2;
        } else if (next !== undefined && /[{}#|<]/u.test(next)) {
          const end = message.indexOf("'", at + 1);
          if (end < 0) throw new MessageError("a quote is not closed");
          found.text += message.slice(at + 1, end);
          at = end + 1;
        } else {
          found.text += "'";
          at += 1;
        }
      } else if (char === "{") {
        at += 1;
        argument(inPlural);
      } else if (char === "}") {
        if (depth === 0) throw new MessageError("a } has no {");
        return;
      } else if (char === "<" && /[A-Za-z/]/u.test(message[at + 1] ?? "")) {
        const close = message[at + 1] === "/";
        const end = message.indexOf(">", at);
        if (end < 0) throw new MessageError("a tag is not closed");
        const name = message.slice(at + (close ? 2 : 1), end);
        at = end + 1;
        if (close) {
          if (name !== tag) throw new MessageError(`</${name}> closes no <${name}>`);
          return;
        }
        found.args.set(name, "tag");
        text(inPlural, depth, name);
        if (message.slice(at - name.length - 3, at) !== `</${name}>`) {
          throw new MessageError(`<${name}> is not closed`);
        }
      } else {
        if (char === "#" && !inPlural) found.hashOutside = true;
        found.text += char;
        at += 1;
      }
    }
    if (depth > 0 || tag) throw new MessageError("a { or a tag is not closed");
  };

  const argument = (inPlural) => {
    const name = word();
    if (!/^[A-Za-z0-9_]+$/u.test(name)) throw new MessageError(`"${name}" is not an argument name`);
    if (message[at] === "}") {
      at += 1;
      if (!found.args.has(name)) found.args.set(name, "simple");
      return;
    }
    if (message[at] !== ",") throw new MessageError(`{${name} is not closed`);
    at += 1;
    const kind = word();
    found.args.set(name, kind);
    if (message[at] === "}") {
      at += 1;
      return;
    }
    if (message[at] !== ",") throw new MessageError(`{${name}, ${kind} is not closed`);
    at += 1;
    if (kind === "plural" || kind === "selectordinal" || kind === "select") {
      const options = [];
      for (;;) {
        skipSpace();
        if (message[at] === "}") {
          at += 1;
          break;
        }
        const option = word();
        if (option.startsWith("offset:")) continue;
        if (!option || message[at] !== "{") throw new MessageError(`{${name}} has a bad option`);
        at += 1;
        options.push(option);
        text(inPlural || kind !== "select", 1);
        if (message[at] !== "}") throw new MessageError(`an option of {${name}} is not closed`);
        at += 1;
      }
      found.choices.push({ name, kind, options });
    } else if (kind === "number" || kind === "date" || kind === "time") {
      const close = message.indexOf("}", at);
      if (close < 0) throw new MessageError(`{${name}, ${kind}} is not closed`);
      at = close + 1;
    } else {
      throw new MessageError(`{${name}, ${kind}} is not a kind next-intl knows`);
    }
  };

  text(false, 0);
  return found;
}

/** Every leaf of a message file as `a.b.c`, with its value. */
function leaves(tree, prefix = "") {
  const found = new Map();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [inner, innerValue] of leaves(value, path)) found.set(inner, innerValue);
    } else {
      found.set(path, value);
    }
  }
  return found;
}

/** The problems of one value in one language, beside the checks across languages. */
function valueProblems(language, key, value, read) {
  const problems = [];
  if (read.hashOutside) problems.push(`${language}: "${key}" has a # outside a plural`);
  for (const choice of read.choices) {
    if (!choice.options.includes("other")) {
      problems.push(`${language}: "${key}" has no "other" in {${choice.name}}`);
    }
    if (language === "ru" && choice.kind === "plural") {
      // Russian `one` is also 21, 31 …: a plural names every form, or only exact numbers.
      const exactOnly = choice.options.every(
        (option) => option === "other" || option.startsWith("="),
      );
      const complete = ["one", "few", "many"].every((option) => choice.options.includes(option));
      if (!exactOnly && !complete) {
        problems.push(
          `ru: "${key}" needs one, few, many and other (or =n and other) in {${choice.name}}`,
        );
      }
    }
  }
  if (!SCRIPT_EXEMPT.has(key)) {
    if (language !== "ru" && CYRILLIC.test(value)) {
      problems.push(`${language}: "${key}" has a Cyrillic letter`);
    }
    if (language === "ru" && LETTER.test(read.text) && !CYRILLIC.test(read.text)) {
      problems.push(`ru: "${key}" has no Cyrillic letter`);
    }
    if (language === "uz" && uzbekApostrophes(value) !== value) {
      problems.push(`uz: "${key}" has an apostrophe that is not ʻ after o or g, ʼ elsewhere`);
    }
  }
  return problems;
}

const describeArgs = (read) => [...read.args.keys()].sort().join(", ") || "none";
const describeSelects = (read) =>
  read.choices
    .filter((choice) => choice.kind === "select")
    .map((choice) => `${choice.name}: ${[...new Set(choice.options)].sort().join(" ")}`)
    .sort()
    .join("; ") || "none";

/** The problems of a set of message files, one line each; empty when they agree. */
export function translationProblems(filesByLanguage) {
  const byLanguage = new Map(
    Object.entries(filesByLanguage).map(([language, tree]) => [language, leaves(tree)]),
  );
  const allKeys = new Set([...byLanguage.values()].flatMap((found) => [...found.keys()]));
  const problems = [];
  for (const key of [...allKeys].sort()) {
    const reads = new Map();
    for (const [language, found] of byLanguage) {
      if (!found.has(key)) {
        problems.push(`${language}: "${key}" is missing`);
        continue;
      }
      const value = found.get(key);
      if (typeof value !== "string" || value.trim() === "") {
        problems.push(`${language}: "${key}" is not a text that is not empty`);
        continue;
      }
      try {
        const read = readMessage(value);
        reads.set(language, read);
        problems.push(...valueProblems(language, key, value, read));
      } catch (error) {
        if (!(error instanceof MessageError)) throw error;
        problems.push(`${language}: "${key}" is not a valid message: ${error.message}`);
      }
    }
    // Only the names count across languages, not their kind: an Uzbek count without a plural is
    // good Uzbek (plan of 8.4, review of decided item 2).
    for (const [describe, what] of [
      [describeArgs, "arguments"],
      [describeSelects, "select options"],
    ]) {
      const seen = [...reads].map(([language, read]) => [language, describe(read)]);
      if (new Set(seen.map(([, described]) => described)).size > 1) {
        const listed = seen.map(([language, described]) => `${language} ${described}`).join("; ");
        problems.push(`"${key}" has different ${what}: ${listed}`);
      }
    }
  }
  return problems;
}

/** Reads `<language>.json` of each language from a folder. */
export function readMessageFiles(folder = MESSAGES_FOLDER, languages = LANGUAGES) {
  return Object.fromEntries(
    languages.map((language) => [
      language,
      JSON.parse(readFileSync(join(folder, `${language}.json`), "utf8")),
    ]),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // A folder may be named for a test; the repository's own files otherwise.
  const problems = translationProblems(readMessageFiles(process.argv[2] ?? MESSAGES_FOLDER));
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`The translation check failed: ${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log(`Every translation key is in ${LANGUAGES.join(", ")}, and the three agree.`);
}
