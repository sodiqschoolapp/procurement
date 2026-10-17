"use client";

import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/components/utils";
import type { Colour } from "@/domain/colours";
import type { OrderProgress } from "@/domain/purchases";
import type { RequestStatus } from "@/domain/request-status";
import { useFormatters } from "@/i18n/use-formatters";

// The one status-label component (docs/design-system.md, "This app, Status labels";
// 11-screens-and-ux.md rule 11: status labels look the same everywhere). A rectangle with corner
// 6, its icon, its word and, for a colour label, the amount.
//
// - A request status (06-approval-workflow.md, Statuses) uses only the info and muted tokens;
//   success, warning and danger are kept for the colour labels and alerts (plan of 0.10a,
//   decision 8).
// - A colour label (08-money-and-settlement.md, The three colours) shows the colour its caller
//   gives; it decides no colour (that is src/domain/colours.ts, plan of 3.8). Green, amber and red use the
//   success, warning and danger tokens; "orange" of 08 is drawn amber (decision 7). The word
//   follows the colour, the amount is shown without its sign, and a difference whose sign
//   contradicts the word is refused (review correction 2). A difference is planned minus
//   actual: above 0 means less was bought, paid or spent (08: "A positive difference means
//   money is left"). Price orange may show 0: two prices that cancel out are "at or below" the
//   plan (08, Price row; plan of 3.8, decided item 3, which replaces 0.10a's "above 0").
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

export const REQUEST_STATUS_LOOK: Record<
  RequestStatus,
  { tone: "info" | "muted"; icon: IconName }
> = {
  DRAFT: { tone: "muted", icon: "edit" },
  PENDING_HEAD: { tone: "info", icon: "schedule" },
  PENDING_PRINCIPAL: { tone: "info", icon: "schedule" },
  PENDING_FINANCE: { tone: "info", icon: "schedule" },
  RETURNED: { tone: "info", icon: "undo" },
  PURCHASING: { tone: "info", icon: "shopping_cart" },
  SETTLEMENT: { tone: "info", icon: "schedule" },
  CLOSED: { tone: "muted", icon: "check_circle" },
  REJECTED: { tone: "muted", icon: "block" },
  CANCELLED: { tone: "muted", icon: "cancel" },
};

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

function LabelBox({
  tone,
  icon,
  className,
  children,
}: {
  tone: Tone;
  icon: IconName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm px-2 text-[13px] leading-[18px] font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon name={icon} size={16} />
      {children}
    </span>
  );
}

/** The label of a request status, in the words of 06-approval-workflow.md. */
export function RequestStatusLabel({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  const t = useTranslations("requestStatus");
  const look = REQUEST_STATUS_LOOK[status];
  return (
    <LabelBox tone={look.tone} icon={look.icon} className={className}>
      {t(status)}
    </LabelBox>
  );
}

/**
 * The label of a numbered order in the drafts grid (05-order-request-form.md, Drafts 5: "with
 * their number and the label 'Sent back' or 'Taken back'"; plan of 2.5b, decided item 17).
 * "Sent back" has the look of RETURNED, so the grid and the order page agree (11 rule 11).
 */
export const DRAFT_LABEL_LOOK = {
  SENT_BACK: REQUEST_STATUS_LOOK.RETURNED,
  TAKEN_BACK: { tone: "info", icon: "history" },
} as const satisfies Record<string, { tone: "info" | "muted"; icon: IconName }>;

export function DraftGridLabel({
  label,
  className,
}: {
  label: keyof typeof DRAFT_LABEL_LOOK;
  className?: string;
}) {
  const t = useTranslations("orders.labels");
  const look = DRAFT_LABEL_LOOK[label];
  return (
    <LabelBox tone={look.tone} icon={look.icon} className={className}>
      {t(label)}
    </LabelBox>
  );
}

/**
 * The label of an order's buying progress (07-purchasing.md, Order progress; plan of 3.5). Like a
 * status, only the info and muted tokens: Open buying is info, a finished one muted.
 */
export const PROGRESS_LOOK = {
  OPEN: { tone: "info", icon: "shopping_cart" },
  DONE: { tone: "muted", icon: "done_all" },
  DONE_SHORT: { tone: "muted", icon: "check_circle" },
  NOT_BOUGHT: { tone: "muted", icon: "block" },
} as const satisfies Record<OrderProgress, { tone: "info" | "muted"; icon: IconName }>;

export function ProgressLabel({
  progress,
  className,
}: {
  progress: OrderProgress;
  className?: string;
}) {
  const t = useTranslations("orders.progress");
  const look = PROGRESS_LOOK[progress];
  return (
    <LabelBox tone={look.tone} icon={look.icon} className={className}>
      <span data-progress={progress}>{t(progress)}</span>
    </LabelBox>
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

/** One of the three colour labels of a line or a request: Number, Price or Total. */
export function ColourLabel(props: ColourLabelProps & { className?: string }) {
  const t = useTranslations("colourLabel");
  const format = useFormatters();
  let amount: string | null = null;
  if ("orders" in props) {
    if (!Number.isInteger(props.orders) || props.orders < 1) {
      throw new Error(`Refused: a set's label counts at least one order, not ${props.orders}.`);
    }
    amount = t("orders", { count: props.orders });
  } else if (props.colour !== "grey") {
    if (props.label === "number") {
      const { sign, magnitude } = splitQuantity(props.difference);
      refuseContradiction(props.label, props.colour, sign);
      amount = format.quantity(magnitude);
    } else {
      const { sign, magnitude } = splitMoney(props.difference);
      refuseContradiction(props.label, props.colour, sign);
      amount = format.money(magnitude);
    }
  }
  // A colour label always carries an icon, a word and the amount (08, The three colours), also
  // green ("Even 0 so'm"); the grey state has no amount yet.
  const word = COLOUR_WORDS[props.label][props.colour];
  const key = `${props.label}.${word}` as Parameters<typeof t>[0];
  return (
    <LabelBox tone={props.colour} icon={COLOUR_ICONS[props.colour]} className={props.className}>
      <span className="sr-only">{t(`${props.label}.name`)}</span>
      {t(key)}
      {amount !== null && <span className="tabular-nums">{amount}</span>}
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
