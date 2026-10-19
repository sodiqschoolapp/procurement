// A count line's difference as shown (09-warehouse.md, Other documents, Stock count: "The system
// shows the differences"; plan of 7.3): countDifference()'s signed text through the quantity
// formatter, with "+" before a rise, so a surplus and a shortage read apart. The page and the
// counting form both show it so.

/** "-2" stays "-2" as the formatter writes it; "2" is "+2"; "0" stays "0". */
export function signedQuantity(difference: string, quantity: (value: string) => string): string {
  const rise = !difference.startsWith("-") && /[1-9]/.test(difference);
  return rise ? `+${quantity(difference)}` : quantity(difference);
}
