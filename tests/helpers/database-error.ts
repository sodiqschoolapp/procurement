// What PostgreSQL says when it refuses a write: the error code, and the constraint, table and
// column it names. A constraint test tries the forbidden write directly and reads the refusal
// with this (developer-rules.md rule 5; docs/decisions.md, 0.2, constraint style 12).
export type DatabaseRefusal = {
  code?: string;
  constraint?: string;
  table?: string;
  column?: string;
};

/** Waits for a write that must be refused. A write that goes through is itself an error. */
export async function refusalOf(write: PromiseLike<unknown>): Promise<DatabaseRefusal> {
  try {
    await write;
  } catch (error) {
    // Drizzle wraps the driver's error and keeps the original as `cause`.
    const original = error instanceof Error && error.cause ? error.cause : error;
    const { code, constraint, table, column } = original as DatabaseRefusal;
    return { code, constraint, table, column };
  }
  throw new Error("The write was not refused: the database accepted it.");
}
