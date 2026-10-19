// A count line's difference as shown (09-warehouse.md, Other documents, Stock count: "The system
// shows the differences"; plan of 7.3): countDifference()'s signed text through the quantity
// formatter, with "+" before a rise, so a surplus and a shortage read apart. The page and the
// counting form both show it so.

/** "-2" is "−2" as the formatter writes it with its minus; "2" is "+2"; "0" stays "0". */
export function signedQuantity(difference: string, quantity: (value: string) => string): string {
  if (difference.startsWith("-")) return `−${quantity(difference.slice(1))}`;
  return /[1-9]/.test(difference) ? `+${quantity(difference)}` : quantity(difference);
}
