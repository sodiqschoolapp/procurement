"use client";

import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/components/utils";
import type { Colour } from "@/domain/colours";
import type { OrderProgress } from "@/domain/purchases";
import type { RequestStatus } from "@/domain/request-status";
import type { DocumentStatus, DocumentType } from "@/domain/stock-documents";
import { useFormatters } from "@/i18n/use-formatters";

// The one status-label component (docs/design-system.md, Parts: "Status and outcome";
// 11-screens-and-ux.md rule 11: status labels look the same everywhere).
//
// - A request status (06-approval-workflow.md, Statuses) is a coloured dot and its word: blue for
//   the approval and buying flow, red for sent back and rejected, green for closed, grey for
//   draft and cancelled (D60, 21.10.2026). Never colour alone: the word is always there.
// - A colour label (08-money-and-settlement.md, The three colours) shows the colour its caller
//   gives; it decides no colour (that is src/domain/colours.ts, plan of 3.8). Green, amber and red
//   use the success, warning and danger tokens; "orange" of 08 is drawn amber, never the brand
//   orange. The word follows the colour, the amount is shown without its sign, and a difference
//   whose sign contradicts the word is refused (review correction 2). A difference is planned
//   minus actual: above 0 means less was bought, paid or spent (08: "A positive difference means
//   money is left"). A green label of one order says its plain word without "0" ("Quantity as
//   planned", "Even"). Price orange may show 0: two prices that cancel out are "at or below" the
//   plan (08, Price row; plan of 3.8, decided item 3).
// - A set's Number and Price carry how many of its orders have that colour, not an amount
//   (plan of 3.8, decided item 2).

type Tone = "info" | "muted" | "green" | "amber" | "red" | "grey";

const TONE_CLASSES: Record<Tone, string> = {
  info: "bg-info-bg text-info",
  muted: "bg-muted text-muted-foreground",
  green: "bg-success-bg text-success",
  amber: "bg-warning-bg text-warning",
  red: "bg-destructive-bg text-destructive",
  grey: "bg-muted text-muted-foreground",
};

/** The dot of a status (design system, Status and outcome). */
export type DotTone = "info" | "red" | "green" | "grey";

const DOT_CLASSES: Record<DotTone, string> = {
  info: "bg-info",
  red: "bg-destructive",
  green: "bg-success",
  grey: "bg-muted-foreground/60",
};

export const REQUEST_STATUS_LOOK: Record<RequestStatus, { dot: DotTone }> = {
  DRAFT: { dot: "grey" },
  PENDING_HEAD: { dot: "info" },
  PENDING_PRINCIPAL: { dot: "info" },
  PENDING_FINANCE: { dot: "info" },
  RETURNED: { dot: "red" },
  PURCHASING: { dot: "info" },
  SETTLEMENT: { dot: "info" },
  CLOSED: { dot: "green" },
  REJECTED: { dot: "red" },
  CANCELLED: { dot: "grey" },
};

/** A status as a dot and its word. */
export function StatusDot({
  tone,
  className,
  children,
}: {
  tone: DotTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-status-dot={tone}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", DOT_CLASSES[tone])} />
      {children}
    </span>
  );
}

const COLOUR_ICONS = {
  green: "check_circle",
  amber: "warning",
  red: "error",
  grey: "schedule",
} as const satisfies Record<string, IconName>;

export type LabelColour = Colour;

/** The word of each label for each colour, and for its grey state. */
export const COLOUR_WORDS = {
  number: { green: "matches", amber: "less", red: "more", grey: "inProgress" },
  price: { green: "matches", amber: "cheaper", red: "dearer", grey: "notBought" },
  total: { green: "even", amber: "left", red: "over", grey: "inProgress" },
} as const;

export type ColourLabelProps =
  | { label: "number"; colour: LabelColour; difference: string }
  | { label: "price" | "total"; colour: LabelColour; difference: bigint }
  | { label: "number" | "price"; colour: LabelColour; orders: number }
  | { label: "number" | "price" | "total"; colour: "grey" };

const SIGN_OF_COLOUR: Record<LabelColour, -1 | 0 | 1> = { green: 0, amber: 1, red: -1 };

const QUANTITY = /^(-?)(\d+)(?:\.(\d+))?$/;

/** The sign of a quantity text and its magnitude, by text alone (never Number or Math.abs). */
function splitQuantity(text: string): { sign: -1 | 0 | 1; magnitude: string } {
  const match = QUANTITY.exec(text);
  if (!match) throw new Error(`Refused: "${text}" is not a quantity difference.`);
  const [, minus = "", whole = "", fraction = ""] = match;
  const isZero = /^0+$/.test(whole) && /^0*$/.test(fraction);
  const magnitude = fraction === "" ? whole : `${whole}.${fraction}`;
  return { sign: isZero ? 0 : minus === "-" ? -1 : 1, magnitude };
}

/** The sign of whole so'm and its magnitude, in bigint only. */
function splitMoney(amount: bigint): { sign: -1 | 0 | 1; magnitude: bigint } {
  if (typeof amount !== "bigint") {
    throw new Error("Refused: money is whole so'm as a bigint, never a JavaScript number.");
  }
  return {
    sign: amount === 0n ? 0 : amount < 0n ? -1 : 1,
    magnitude: amount < 0n ? -amount : amount,
  };
}

function refuseContradiction(
  label: ColourLabelProps["label"],
  colour: LabelColour,
  sign: -1 | 0 | 1,
): void {
  // Price orange is "at or below" the plan, so 0 too (decided item 3 of 3.8).
  const zeroAllowed = label === "price" && colour === "amber";
  if (SIGN_OF_COLOUR[colour] === sign || (zeroAllowed && sign === 0)) return;
  throw new Error(
    `Refused: ${label} "${COLOUR_WORDS[label][colour]}" needs a difference ${
      colour === "green"
        ? "of exactly 0"
        : zeroAllowed
          ? "of 0 or more"
          : colour === "amber"
            ? "above 0"
            : "below 0"
    }.`,
  );
}

/** The text colour of each tone, for a label drawn without its tint (an outcome line). */
const PLAIN_CLASSES: Record<Tone, string> = {
  info: "text-info",
  muted: "text-muted-foreground",
  green: "text-success",
  amber: "text-warning",
  red: "text-destructive",
  grey: "text-muted-foreground",
};

function LabelBox({
  tone,
  icon,
  plain = false,
  className,
  children,
}: {
  tone: Tone;
  icon: IconName;
  /** Without its tint: the icon and the words in the tone's colour (an outcome line). */
  plain?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium whitespace-nowrap",
        plain
          ? cn("text-small", PLAIN_CLASSES[tone])
          : cn("h-6 rounded-sm px-2 text-xs", TONE_CLASSES[tone]),
        className,
      )}
    >
      <Icon name={icon} size={16} />
      {children}
    </span>
  );
}

/** The status of an order, in the words of 06-approval-workflow.md: a dot and the word. */
export function RequestStatusLabel({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  const t = useTranslations("requestStatus");
  return (
    <StatusDot tone={REQUEST_STATUS_LOOK[status].dot} className={className}>
      <span data-request-status={status}>{t(status)}</span>
    </StatusDot>
  );
}

/**
 * The label of a numbered order in the drafts grid (05-order-request-form.md, Drafts 5: "with
 * their number and the label 'Sent back' or 'Taken back'"; plan of 2.5b, decided item 17).
 * "Sent back" has the look of RETURNED, so the grid and the order page agree (11 rule 11).
 */
export const DRAFT_LABEL_LOOK = {
  SENT_BACK: REQUEST_STATUS_LOOK.RETURNED,
  TAKEN_BACK: { dot: "info" },
} as const satisfies Record<string, { dot: DotTone }>;

export function DraftGridLabel({
  label,
  className,
}: {
  label: keyof typeof DRAFT_LABEL_LOOK;
  className?: string;
}) {
  const t = useTranslations("orders.labels");
  return (
    <StatusDot tone={DRAFT_LABEL_LOOK[label].dot} className={className}>
      {t(label)}
    </StatusDot>
  );
}

/**
 * The label of an order's buying progress (07-purchasing.md, Order progress; plan of 3.5). Like a
 * status, only the info and muted tokens: Open buying is info, a finished one muted.
 */
export const PROGRESS_LOOK = {
  OPEN: { dot: "info" },
  DONE: { dot: "green" },
  DONE_SHORT: { dot: "green" },
  NOT_BOUGHT: { dot: "grey" },
} as const satisfies Record<OrderProgress, { dot: DotTone }>;

export function ProgressLabel({
  progress,
  className,
}: {
  progress: OrderProgress;
  className?: string;
}) {
  const t = useTranslations("orders.progress");
  return (
    <StatusDot tone={PROGRESS_LOOK[progress].dot} className={className}>
      <span data-progress={progress}>{t(progress)}</span>
    </StatusDot>
  );
}

/**
 * "Substituted" (07-purchasing.md, Substitution; plan of 3.6, decided item 8): another subtype of
 * the product was bought. Not a colour label, so the info token, with its icon and word.
 */
export function SubstitutedLabel({ className }: { className?: string }) {
  const t = useTranslations("orders");
  return (
    <LabelBox tone="info" icon="swap_horiz" className={className}>
      <span data-substituted>{t("substituted")}</span>
    </LabelBox>
  );
}

/** A warehouse document undone with Reverse (09 Issue to a department 3; plan of 5.7). */
export function ReversedLabel({ className }: { className?: string }) {
  const t = useTranslations("warehouse.item");
  return (
    <LabelBox tone="muted" icon="undo" className={className}>
      <span data-reversed>{t("reversed")}</span>
    </LabelBox>
  );
}

/**
 * A warehouse document's status (plans of 5.11 and 5.12): the request statuses' tones, never a
 * colour label's. A write-off's words are its own ("Approved", "Refused"); the other types say
 * "Posted".
 */
const DOCUMENT_STATUS_LOOK = {
  PENDING_APPROVAL: { dot: "info" },
  POSTED: { dot: "green" },
  IN_TRANSIT: { dot: "info" },
  RECEIVED: { dot: "green" },
  REJECTED: { dot: "red" },
  REVERSED: { dot: "grey" },
  CANCELLED: { dot: "grey" },
} as const satisfies Record<DocumentStatus, { dot: DotTone }>;

export function DocumentStatusLabel({
  type,
  status,
  className,
}: {
  type: DocumentType;
  status: DocumentStatus;
  className?: string;
}) {
  const tWriteOff = useTranslations("warehouse.writeOff.page.status");
  const t = useTranslations("warehouse.documents.status");
  const word =
    type === "WRITE_OFF" &&
    status !== "IN_TRANSIT" &&
    status !== "RECEIVED" &&
    status !== "CANCELLED"
      ? tWriteOff(status)
      : t(status);
  return (
    <StatusDot tone={DOCUMENT_STATUS_LOOK[status].dot} className={className}>
      <span data-document-status={status}>{word}</span>
    </StatusDot>
  );
}

/** One of the three colour labels of a line or a request: Number, Price or Total. */
export function ColourLabel(props: ColourLabelProps & { className?: string; plain?: boolean }) {
  const t = useTranslations("colourLabel");
  const format = useFormatters();
  let amount: string | null = null;
  if ("orders" in props) {
    if (!Number.isInteger(props.orders) || props.orders < 1) {
      throw new Error(`Refused: a set's label counts at least one order, not ${props.orders}.`);
    }
    amount = t("orders", { count: props.orders });
  } else if (props.colour !== "grey") {
    // A green label of one order is its plain word: "Quantity as planned", not "Matches 0".
    if (props.colour === "green") {
      if (props.label === "number")
        refuseContradiction("number", "green", splitQuantity(props.difference).sign);
      else refuseContradiction(props.label, "green", splitMoney(props.difference).sign);
    } else if (props.label === "number") {
      const { sign, magnitude } = splitQuantity(props.difference);
      refuseContradiction(props.label, props.colour, sign);
      amount = format.quantity(magnitude);
    } else {
      const { sign, magnitude } = splitMoney(props.difference);
      refuseContradiction(props.label, props.colour, sign);
      amount = format.money(magnitude);
    }
  }
  // A colour label always carries an icon and a word, and the amount when it has one (08, The
  // three colours); green has nothing to count and the grey state no amount yet.
  const word = COLOUR_WORDS[props.label][props.colour];
  const key = `${props.label}.${word}` as Parameters<typeof t>[0];
  return (
    <LabelBox
      tone={props.colour}
      icon={COLOUR_ICONS[props.colour]}
      plain={props.plain}
      className={props.className}
    >
      <span className="sr-only">{t(`${props.label}.name`)}</span>
      {t(key)}
      {amount !== null && <span className="tabular-nums">{amount}</span>}
    </LabelBox>
  );
}

/**
 * The Total label of a Plan vs actual outcome on the Analytics page (10 Analytics, Head; plan of
 * 6.4): the colour's icon and word with the amount of its orders, without its sign: green 0,
 * orange the money left, red the overspent. Unlike a set's label it may count no order, so its
 * amount may be 0 in any colour.
 */
export function OutcomeLabel({
  colour,
  amount,
  className,
}: {
  colour: LabelColour;
  amount: bigint;
  className?: string;
}) {
  const t = useTranslations("colourLabel");
  const format = useFormatters();
  if (amount < 0n || (colour === "green" && amount !== 0n)) {
    throw new Error(`Refused: an outcome's amount is shown without its sign, not ${amount}.`);
  }
  return (
    <LabelBox tone={colour} icon={COLOUR_ICONS[colour]} className={className}>
      <span className="sr-only">{t("total.name")}</span>
      {t(`total.${COLOUR_WORDS.total[colour]}`)}
      {colour !== "green" && <span className="tabular-nums">{format.money(amount)}</span>}
    </LabelBox>
  );
}

/**
 * One label as the server sends it (plan of 3.8): money as decimal text, never a JavaScript number
 * (CLAUDE.md rule 6); a set's Number and Price as a count of orders.
 */
export type WireColourLabel =
  | { colour: "grey" }
  | { colour: LabelColour; difference: string }
  | { colour: LabelColour; orders: number };

export type WireColours = {
  number: WireColourLabel;
  price: WireColourLabel;
  total: WireColourLabel;
};

function labelProps(label: "number" | "price" | "total", wire: WireColourLabel): ColourLabelProps {
  if (wire.colour === "grey") return { label, colour: "grey" };
  if ("orders" in wire) {
    if (label === "total") throw new Error("Refused: Total carries the summed difference.");
    return { label, colour: wire.colour, orders: wire.orders };
  }
  if (label === "number") return { label, colour: wire.colour, difference: wire.difference };
  return { label, colour: wire.colour, difference: BigInt(wire.difference) };
}

/** Number, Price and Total of an order, a group row or ticked orders, side by side. */
export function ColourLabels({ colours, className }: { colours: WireColours; className?: string }) {
  return (
    <span data-colours className={cn("inline-flex flex-wrap gap-1", className)}>
      {(["number", "price", "total"] as const).map((label) => (
        <span key={label} data-colour-label={label} data-colour={colours[label].colour}>
          <ColourLabel {...labelProps(label, colours[label])} />
        </span>
      ))}
    </span>
  );
}

/**
 * "No receipt" (edge case "No receipt photo": "Finance sees a 'No receipt' label"; plan of 4.5,
 * decided item 12): a live purchase record of the order has no receipt file. An alert, so amber,
 * with its icon and word.
 */
export function NoReceiptLabel({ className }: { className?: string }) {
  const t = useTranslations("money.settle");
  return (
    <LabelBox tone="amber" icon="receipt_long" className={className}>
      <span data-no-receipt>{t("noReceipt")}</span>
    </LabelBox>
  );
}

/**
 * "Low" (09-warehouse.md, Low stock: "the item gets a 'Low' label"; 00-definitions, Low; plan of
 * 5.10): at or below its minimum. Needs attention, so the warning tokens, with its icon and word.
 */
export function LowLabel({ className }: { className?: string }) {
  const t = useTranslations("warehouse.low");
  return (
    <LabelBox tone="amber" icon="warning" className={className}>
      <span data-low>{t("label")}</span>
    </LabelBox>
  );
}

/**
 * The outcome of a list row (docs/design-system.md, Status and outcome): the Total label as the
 * one phrase that says how the money ended ("Over by 15 000 so'm", "Left 50 000 so'm", "Even",
 * "In progress"), then Number and Price as small words only when they are orange or red ("Less 2",
 * "Dearer 1 order"). Every label keeps its icon, word and amount; the colours are the server's.
 */
export function ColourOutcome({
  colours,
  className,
}: {
  colours: WireColours;
  className?: string;
}) {
  const telling = (["number", "price"] as const).filter(
    (label) => colours[label].colour === "amber" || colours[label].colour === "red",
  );
  return (
    <span data-colours data-outcome className={cn("flex flex-col gap-0.5", className)}>
      <span data-colour-label="total" data-colour={colours.total.colour}>
        <ColourLabel plain {...labelProps("total", colours.total)} />
      </span>
      {telling.length > 0 && (
        <span className="flex flex-wrap [justify-content:inherit] gap-x-3">
          {telling.map((label) => (
            <span key={label} data-colour-label={label} data-colour={colours[label].colour}>
              <ColourLabel plain {...labelProps(label, colours[label])} className="text-xs" />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
