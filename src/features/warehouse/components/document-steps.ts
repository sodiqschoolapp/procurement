// The steps of the issue and return forms at phone width (11-screens-and-ux.md, Interface per role: Manager,
// "Buying and issuing have phone layouts"; plans of 5.4 and 5.6, Screens): 0 who and when, 1 the lines,
// 2 the comment and Save. After a refused save the form opens the first step that holds an error,
// so no error is left on a hidden step (smooth feel 4). Plain decisions, tested without a browser.

export const DOCUMENT_STEPS = 3;

const HEADER_FIELDS = new Set(["branchId", "docDate", "departmentId", "receivedByName"]);

/** The step of one field the server named: the header, a line, or the last step. */
function stepOf(key: string): number {
  if (HEADER_FIELDS.has(key)) return 0;
  if (key === "lines" || key.startsWith("lines.")) return 1;
  return DOCUMENT_STEPS - 1;
}

/** The step to show after a refused save: the first with an error, or `current` with none. */
export function firstDocumentStepWithError(errorKeys: readonly string[], current: number): number {
  if (errorKeys.length === 0) return current;
  return Math.min(...errorKeys.map(stepOf));
}
