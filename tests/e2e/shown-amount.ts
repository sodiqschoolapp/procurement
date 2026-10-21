// What a money field shows of an amount (redesign of 21.10.2026; 11-screens-and-ux.md rule 10):
// the digits grouped by three with no-break spaces, `5 000`. Written here on its own, not taken
// from src/, so a test of the field does not borrow the code it checks; the field still sends the
// plain digits, which the money tests read back from the database.
export function shownAmount(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
