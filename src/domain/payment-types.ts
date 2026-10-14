// The payment types of docs/spec/14-data-model.md (`payment_type [CASH|TRANSFER|CARD]` of
// orf_lines, purchases and purchase_extras) as codes only; 05-order-request-form.md field 12
// names them "Cash, Bank transfer or Corporate card". The words shown for them are
// `paymentTypes.<CODE>` in the three message files. The request tasks build their enum from
// this list, so the codes live once (developer-rules.md rule 1; plan of 1.1, decision 14).

export const PAYMENT_TYPES = ["CASH", "TRANSFER", "CARD"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
