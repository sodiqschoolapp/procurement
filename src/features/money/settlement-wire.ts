import type { SettlementRow } from "@/domain/money-ledger";
import type { PaymentType } from "@/domain/payment-types";

import type { Settlement } from "./queries/settlement";

// The settlement screen's answer as it goes to the browser (plan of 4.5): money as text of whole
// so'm, never a JavaScript number (CLAUDE.md rule 6). The browser turns it back into bigint for
// the domain functions it calls (settlementCashRows(), settlementNet()).

type Money = string;

export type WireSettlementOrder = {
  id: string;
  version: number;
  number: string;
  productName: string;
  subtypeName: string | null;
  paymentType: PaymentType;
  plannedTotal: Money;
  cash: { given: Money; spent: Money; returned: Money; paidBack: Money; count: Money } | null;
  transfer: {
    planned: Money;
    transferred: Money;
    received: Money;
    confirmed: boolean;
    ticked: boolean;
    note: string | null;
    needsNote: boolean;
  } | null;
  card: {
    planned: Money;
    charged: Money;
    difference: Money;
    returned: Money;
    confirmed: boolean;
  } | null;
  prefill: { kind: SettlementRow["kind"]; amount: Money } | null;
  cancelledRecords: string[];
  noReceipt: boolean;
  canRecordMoney: boolean;
  overspend: { over: Money; percent: string | null; acknowledgedBy: string | null } | null;
};

export type WireSettlement = {
  branchCode: string;
  today: string;
  managers: { id: string; name: string; orders: WireSettlementOrder[] }[];
};

export function wireSettlement(settlement: Settlement): WireSettlement {
  return {
    branchCode: settlement.branchCode,
    today: settlement.today,
    managers: settlement.managers.map((manager) => ({
      id: manager.id,
      name: manager.name,
      orders: manager.orders.map((order) => {
        const { cash, transfer, card } = order.blocks;
        return {
          id: order.id,
          version: order.version,
          number: order.number,
          productName: order.productName,
          subtypeName: order.subtypeName,
          paymentType: order.paymentType,
          plannedTotal: order.plannedTotal.toString(),
          cash: cash
            ? {
                given: cash.given.toString(),
                spent: cash.spent.toString(),
                returned: cash.returned.toString(),
                paidBack: cash.paidBack.toString(),
                count: cash.count.toString(),
              }
            : null,
          transfer:
            transfer && order.transfer
              ? {
                  planned: transfer.planned.toString(),
                  transferred: transfer.transferred.toString(),
                  received: transfer.received.toString(),
                  ...order.transfer,
                }
              : null,
          card:
            card && order.card
              ? {
                  planned: card.planned.toString(),
                  charged: card.charged.toString(),
                  difference: card.difference.toString(),
                  returned: card.returned.toString(),
                  confirmed: order.card.confirmed,
                }
              : null,
          prefill: order.prefill
            ? { kind: order.prefill.kind, amount: order.prefill.amount.toString() }
            : null,
          cancelledRecords: order.cancelledRecords,
          noReceipt: order.noReceipt,
          canRecordMoney: order.canRecordMoney,
          overspend: order.overspend
            ? {
                over: order.overspend.over.toString(),
                percent: order.overspend.percent,
                acknowledgedBy: order.overspend.acknowledgedBy,
              }
            : null,
        };
      }),
    })),
  };
}
