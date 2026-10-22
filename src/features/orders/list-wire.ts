import type { WireColourLabel, WireColours } from "@/components/status-label";
import type { OrderColours, OrderLabel, SetColours, SetLabel } from "@/domain/colours";
import type { OrdersTotals } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";

import type { ListOrder, OrderGroup, TickedSummary } from "./queries/order-list";

// What the order list receives from the server (plan of 2.8): money and percents as decimal text,
// never a JavaScript number (CLAUDE.md rule 6), as the drafts grid does (./draft-wire.ts). The
// screen reads the text back with BigInt() only for the formatter; it adds nothing up.

export type WireTotals = {
  goods: string;
  extras: string;
  grand: string;
  byPaymentType: Record<PaymentType, string>;
};

export type WireListOrder = Omit<
  ListOrder,
  "price" | "plannedTotal" | "priceHint" | "colours" | "actual"
> & {
  price: string;
  plannedTotal: string;
  priceHint: string | null;
  colours: WireColours | null;
  actual: { unitPrice: string; oneUnitPrice: boolean; total: string } | null;
};

export type WireOrderGroup = Omit<OrderGroup, "summary" | "orders" | "colours"> & {
  colours: WireColours | null;
  summary: Omit<OrderGroup["summary"], "totals" | "priceHint"> & {
    totals: WireTotals;
    priceHint: string | null;
  };
  orders: WireListOrder[];
};

export type WireTickedSummary = Omit<TickedSummary, "totals" | "colours" | "orders"> & {
  totals: WireTotals;
  colours: WireColours | null;
  orders: (Omit<TickedSummary["orders"][number], "plannedTotal"> & { plannedTotal: string })[];
};

function wireLabel(label: OrderLabel<string | bigint> | SetLabel): WireColourLabel {
  if (label.colour === "grey") return { colour: "grey" };
  if ("orders" in label) return { colour: label.colour, orders: label.orders };
  return { colour: label.colour, difference: label.difference.toString() };
}

/** The three colours of src/domain/colours.ts with money as decimal text (plan of 3.8). */
export function wireColours(colours: OrderColours | SetColours | null): WireColours | null {
  if (colours === null) return null;
  return {
    number: wireLabel(colours.number),
    price: wireLabel(colours.price),
    total: wireLabel(colours.total),
  };
}

export function wireTotals(totals: OrdersTotals): WireTotals {
  return {
    goods: totals.goods.toString(),
    extras: totals.extras.toString(),
    grand: totals.grand.toString(),
    byPaymentType: {
      CASH: totals.byPaymentType.CASH.toString(),
      TRANSFER: totals.byPaymentType.TRANSFER.toString(),
      CARD: totals.byPaymentType.CARD.toString(),
    },
  };
}

export function wireGroup(group: OrderGroup): WireOrderGroup {
  return {
    ...group,
    summary: {
      ...group.summary,
      totals: wireTotals(group.summary.totals),
      priceHint: group.summary.priceHint?.toString() ?? null,
    },
    colours: wireColours(group.colours),
    orders: group.orders.map((order) => ({
      ...order,
      price: order.price.toString(),
      plannedTotal: order.plannedTotal.toString(),
      priceHint: order.priceHint?.toString() ?? null,
      colours: wireColours(order.colours),
      actual: order.actual && {
        unitPrice: order.actual.unitPrice.toString(),
        oneUnitPrice: order.actual.oneUnitPrice,
        total: order.actual.total.toString(),
      },
    })),
  };
}

export function wireTickedSummary(summary: TickedSummary): WireTickedSummary {
  return {
    ...summary,
    totals: wireTotals(summary.totals),
    colours: wireColours(summary.colours),
    orders: summary.orders.map((order) => ({
      ...order,
      plannedTotal: order.plannedTotal.toString(),
    })),
  };
}
