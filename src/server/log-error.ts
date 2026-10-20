// What the log, and the error reporter of 9.3, may hold of an error. Moved here from
// src/server/action.ts (which still exports it), so src/server/error-report.ts reads it without
// importing the action wrapper.

type DatabaseFailure = { code: string; constraint?: unknown };

function databaseFailureOf(error: unknown): DatabaseFailure | null {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== "object") return null;
    if (
      "code" in current &&
      typeof current.code === "string" &&
      /^[0-9A-Z]{5}$/.test(current.code)
    ) {
      return current as DatabaseFailure;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

/**
 * What the log may hold of an error (plan of 0.8, decision 7; CLAUDE.md conventions: no
 * personal data in a log). A database error gives its name, its PostgreSQL code and constraint
 * only: Drizzle's message carries every bound value of the statement, and PostgreSQL's own
 * message and `detail` can quote a value. Any other error gives its name and message.
 */
export function describeForLog(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const database = databaseFailureOf(error);
  if (database) {
    const constraint =
      typeof database.constraint === "string" ? ` constraint ${database.constraint}` : "";
    return `${name}: PostgreSQL ${database.code}${constraint}`;
  }
  if (error instanceof Error && !/^Failed query:/.test(error.message)) {
    return `${name}: ${error.message}`;
  }
  return name;
}
