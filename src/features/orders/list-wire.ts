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

export type WireListOrder = Omit<ListOrder, "price" | "priceHint"> & {
  price: string;
  priceHint: string | null;
};

export type WireOrderGroup = Omit<OrderGroup, "summary" | "orders"> & {
  summary: Omit<OrderGroup["summary"], "totals" | "priceHint"> & {
    totals: WireTotals;
    priceHint: string | null;
  };
  orders: WireListOrder[];
};

export type WireTickedSummary = Omit<TickedSummary, "totals"> & { totals: WireTotals };

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
    orders: group.orders.map((order) => ({
      ...order,
      price: order.price.toString(),
      priceHint: order.priceHint?.toString() ?? null,
    })),
  };
}

export function wireTickedSummary(summary: TickedSummary): WireTickedSummary {
  return { ...summary, totals: wireTotals(summary.totals) };
}
