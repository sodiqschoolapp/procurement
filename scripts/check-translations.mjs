// The translation check (15-quality-and-acceptance.md, Done-check: "No translation key is
// missing in Uzbek, Russian or English"; 11-screens-and-ux.md rule 14). Every key of the three
// message files must be in all three, and every value must be a text that is not empty
// (decisions 0.5 item 8). `npm run i18n:check`; CI runs it in the job `checks`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MESSAGES_FOLDER = fileURLToPath(new URL("../src/i18n/messages", import.meta.url));
export const LANGUAGES = ["uz", "ru", "en"];

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

/** The problems of a set of message files, one line each; empty when they agree. */
export function translationProblems(filesByLanguage) {
  const byLanguage = new Map(
    Object.entries(filesByLanguage).map(([language, tree]) => [language, leaves(tree)]),
  );
  const allKeys = new Set([...byLanguage.values()].flatMap((found) => [...found.keys()]));
  const problems = [];
  for (const key of [...allKeys].sort()) {
    for (const [language, found] of byLanguage) {
      if (!found.has(key)) {
        problems.push(`${language}: "${key}" is missing`);
      } else {
        const value = found.get(key);
        if (typeof value !== "string" || value.trim() === "") {
          problems.push(`${language}: "${key}" is not a text that is not empty`);
        }
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
  console.log(`Every translation key is in ${LANGUAGES.join(", ")}.`);
}
