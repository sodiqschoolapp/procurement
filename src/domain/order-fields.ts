// The fields the Head sets (05-order-request-form.md, Fields the Head sets; D67): for each field
// of the table, how it is asked and where it stands in the order sheet. Pure: the field names,
// the choices each field can take, the defaults of 05's table, the shape check, and what a hidden
// field stores, written once (developer-rules.md rule 1). The setting is `order_fields`
// (14-data-model.md, Notes for the build); migration 0056 holds the same shape as a CHECK, and
// src/server/db/schema/orders-fields.db.test.ts checks the SQL against these constants.

/** The fields of 05's table, in the order the Settings page and the sheet's "More" show them. */
export const ORDER_FIELDS = [
  "department",
  "neededBy",
  "price",
  "paymentType",
  "priority",
  "brand",
  "requesterName",
  "comment",
  "referencePhoto",
  "extras",
] as const;

export type OrderField = (typeof ORDER_FIELDS)[number];

/** How a field is asked. `shown` is the one choice besides `hidden` of payment type and priority. */
export type Ask = "required" | "optional" | "hidden" | "shown";

/** Where a field that is not hidden stands (05 Fields the Head sets 1). */
export type Place = "row" | "more";

export const PLACES = ["row", "more"] as const satisfies readonly Place[];

/** 05's table, "Can be" column. */
export const ASK_CHOICES: { [Field in OrderField]: readonly Ask[] } = {
  department: ["required", "optional", "hidden"],
  neededBy: ["required", "optional", "hidden"],
  price: ["required", "optional", "hidden"],
  paymentType: ["shown", "hidden"],
  priority: ["shown", "hidden"],
  brand: ["required", "optional", "hidden"],
  requesterName: ["required", "optional", "hidden"],
  comment: ["required", "optional", "hidden"],
  referencePhoto: ["required", "optional", "hidden"],
  extras: ["optional", "hidden"],
};

export type FieldRule = { ask: Ask; place: Place };

export type OrderFields = { [Field in OrderField]: FieldRule };

/** 05's table, "Default" column: with these the sheet is the sheet of 2.5c (D65). */
export const ORDER_FIELDS_DEFAULT: OrderFields = {
  department: { ask: "required", place: "row" },
  neededBy: { ask: "required", place: "row" },
  price: { ask: "required", place: "row" },
  paymentType: { ask: "shown", place: "more" },
  priority: { ask: "shown", place: "more" },
  brand: { ask: "optional", place: "more" },
  requesterName: { ask: "optional", place: "more" },
  comment: { ask: "optional", place: "more" },
  referencePhoto: { ask: "optional", place: "more" },
  extras: { ask: "optional", place: "more" },
};

function hasExactly(value: object, keys: readonly string[]): boolean {
  const own = Object.keys(value).sort();
  const want = [...keys].sort();
  return own.length === want.length && own.every((key, at) => key === want[at]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A whole `order_fields` value: exactly the ten fields, each exactly `ask` and `place`, each `ask`
 * one of its field's choices (plan of 2.5d, decided item 3). The CHECK of migration 0056 asks the
 * same.
 */
export function isOrderFields(value: unknown): value is OrderFields {
  if (!isPlainObject(value) || !hasExactly(value, ORDER_FIELDS)) return false;
  return ORDER_FIELDS.every((field) => {
    const rule = value[field];
    if (!isPlainObject(rule) || !hasExactly(rule, ["ask", "place"])) return false;
    return (
      (ASK_CHOICES[field] as readonly unknown[]).includes(rule.ask) &&
      (PLACES as readonly unknown[]).includes(rule.place)
    );
  });
}

/** Whether two values hold the same rule for every field. */
export function sameOrderFields(a: OrderFields, b: OrderFields): boolean {
  return ORDER_FIELDS.every(
    (field) => a[field].ask === b[field].ask && a[field].place === b[field].place,
  );
}

export function isHidden(fields: OrderFields, field: OrderField): boolean {
  return fields[field].ask === "hidden";
}

export function isRequired(fields: OrderFields, field: OrderField): boolean {
  return fields[field].ask === "required";
}

/** Where the field stands; `null` when it is hidden and stands nowhere (05 rule 2). */
export function placeOf(fields: OrderFields, field: OrderField): Place | null {
  return isHidden(fields, field) ? null : fields[field].place;
}

/**
 * Whether the price may be asked as the fields say with the Finance step on or off (06 Finance step
 * switched off 8: "The Head can make the price per unit optional or hidden only while the step is
 * off"; 05 Fields the Head sets, Price per unit). The settings form and the switch both ask it:
 * saving an optional price is refused while the step is on, and switching the step on while the
 * price is not required.
 */
export function priceAskAllowed(fields: OrderFields, financeStep: boolean): boolean {
  return !financeStep || fields.price.ask === "required";
}

/** The plan of a never-submitted draft, as a submit writes it (only the fields 05's table names). */
export type HiddenFieldsPlan<PaymentType extends string> = {
  departmentId: string | null;
  /** The planned price per unit, whole so'm; null for none. */
  price: bigint | null;
  neededBy: string | null;
  paymentType: PaymentType;
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
  companyId: string | null;
  requesterName: string | null;
  comment: string | null;
  referencePhotoFileId: string | null;
  /** Whether the draft's extra costs are kept; `false` means none is stored. */
  keepExtras: boolean;
};

/**
 * What a submit stores for a draft that never had a number (05 Fields the Head sets 2: "Hidden
 * fields are not shown in the sheet or on new orders. A hidden payment type is the default payment
 * type (a setting), a hidden priority is Normal"): each hidden field takes its hidden value, every
 * other field keeps what the draft holds. An order with a number keeps what it holds (05 rule 4:
 * "orders already submitted keep what they hold"; plan of 2.5d, decided item 2, Look first): the
 * caller does not ask this function for it. A hidden price is the suggested price of 05 field 11
 * at the moment of the submit (the reference price, else the last purchase price: `suggestedPrice()`
 * of ./drafts.ts, which the caller passes), else none, never the price the draft held (05 rule 2;
 * plan of 2.5d-b, decided item 8).
 */
export function withHiddenValues<PaymentType extends string>(
  fields: OrderFields,
  plan: Omit<HiddenFieldsPlan<PaymentType>, "keepExtras">,
  defaultPaymentType: PaymentType,
  suggested: bigint | null,
): HiddenFieldsPlan<PaymentType> {
  const hidden = (field: OrderField) => isHidden(fields, field);
  const priorityHidden = hidden("priority");
  return {
    departmentId: hidden("department") ? null : plan.departmentId,
    price: hidden("price") ? suggested : plan.price,
    neededBy: hidden("neededBy") ? null : plan.neededBy,
    paymentType: hidden("paymentType") ? defaultPaymentType : plan.paymentType,
    priority: priorityHidden ? "NORMAL" : plan.priority,
    urgentReason: priorityHidden ? null : plan.urgentReason,
    companyId: hidden("brand") ? null : plan.companyId,
    requesterName: hidden("requesterName") ? null : plan.requesterName,
    comment: hidden("comment") ? null : plan.comment,
    referencePhotoFileId: hidden("referencePhoto") ? null : plan.referencePhotoFileId,
    keepExtras: !hidden("extras"),
  };
}
