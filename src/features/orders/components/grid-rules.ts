// A rule of the drafts grid's screen that is not a business rule (plan of 2.5b, decided item 2,
// Look first; spec review of 2.5b, Must fix 3): "Apply to ticked" is offered only when every
// ticked row may be edited. A read-only row (a Manager with CREATE_REQUESTS off) may be ticked
// for the totals under the grid, never edited. The rights come from draftRowRights().

export function canApplyToTicked(
  ticked: readonly string[],
  rights: ReadonlyMap<string, { editable: boolean }>,
): boolean {
  return ticked.length > 0 && ticked.every((id) => rights.get(id)?.editable === true);
}
