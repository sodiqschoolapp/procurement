import { eq } from "drizzle-orm";
import * as z from "zod";

import { isBusinessDate } from "@/domain/business-date";
import { FILE_MIMES } from "@/domain/files";
import { parseSomOrZero } from "@/domain/money";
import {
  MONEY_ROW_KINDS,
  type MoneyRowKind,
  actionTotal,
  crossingRefusal,
  moneyRecordAllows,
  orderCashCount,
} from "@/domain/money-ledger";
import { ActionError } from "@/server/action";
import type { FieldMessageKey, OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import { files, moneyActions, moneyRows } from "@/server/db/schema";
import { accessOf } from "@/server/files/owners";
import { notify } from "@/server/notify";
import {
  type LockedOrder,
  type OrdersContext,
  type OrdersInput,
  OrdersRefusal,
  type Transaction,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";

import { actionLink, branchNotices } from "../../orders/actions/notices";
import { cashRecordsOf } from "../../purchasing/order-records";
import { moneyRowsOf } from "../money-rows";

// Record money on ticked orders from the Money tab or the order list (08-money-and-settlement.md,
// Money ledger; 03-roles-and-permissions.md, Permission matrix: "Record money given, returned, paid
// back", Finance of its own branches; plan of 4.3). In the wrapper of src/server/order-action.ts:
// lock, repeat, authorize `money.record` per order, version, then:
//
//   check    the comment (1 to 1000), the date, the document number, at least one amount above
//            0; every order Open or Waiting for settlement (`moneyRecordAllows()`; decided item 1,
//            Look first); one Manager's orders in one branch (decided item 4, Look first); a file
//            only for one Manager (decided item 5, Look first)
//   write    first no crossing over: each Cash returned or Paid back row against the order's
//            count before the action, read under the orders' lock (08 Money ledger 3; decided item
//            3, Look first), refused `not_ready` with the field that says why; then the file:
//            uploaded by the actor, a stored type, held by no record, its row locked FOR UPDATE
//            (the file contract of src/server/files/owners.ts); then one money action per Manager (08 Money ledger 1), all with the browser id
//            (14: UNIQUE (client_key, manager_id)) and this action's `order_actions` row, and its
//            rows of one kind (08 Money ledger 2); rows of 0 write nothing
//   notify   one notice to each owner given a cash kind (10 Notifications, "Cash given, cash
//            returned, paid back | Owner"; decided item 7); the information kinds tell no one
//
// The wrapper raises the versions and writes one history event per order (decided item 12).

export type RecordMoneyInput = OrdersInput & {
  kind: MoneyRowKind;
  occurredOn: string;
  documentNo?: string;
  fileId?: string | null;
  comment: string;
  amounts: Record<string, bigint>;
};

/** 14 money_actions: the document number up to 100, the comment up to 1000 (4.1). */
export const MONEY_DOCUMENT_MAX = 100;
export const MONEY_COMMENT_MAX = 1000;

/** Whole so'm from 0, typed as digits; never a JavaScript number (developer-rules.md rule 6). */
const amountField = z
  .string()
  .refine((value) => parseSomOrZero(value) !== null)
  .transform((value) => parseSomOrZero(value)!);

const input = ordersInput({
  kind: z.enum(MONEY_ROW_KINDS),
  occurredOn: z.string(),
  documentNo: z.string().optional(),
  fileId: z.uuid().nullable().optional(),
  comment: z.string(),
  amounts: z.record(z.uuid(), amountField),
}).refine(
  (value) => {
    const ticked = new Set(value.orders.map((order) => order.id));
    return Object.keys(value.amounts).every((id) => ticked.has(id));
  },
  // An amount on an order that is not ticked is never read (review of the plan, Should fix 5).
  { path: ["amounts"], message: "An amount names an order that is not ticked." },
) as unknown as z.ZodType<RecordMoneyInput>;

/** The trimmed comment, document number and date, or the fields that refuse them. */
function storedFields(value: RecordMoneyInput): {
  comment: string;
  documentNo: string | null;
  occurredOn: string;
} {
  const fields: Record<string, FieldMessageKey> = {};
  const comment = value.comment.trim();
  if (comment === "") fields.comment = "errors.field.required";
  else if (Array.from(comment).length > MONEY_COMMENT_MAX) fields.comment = "errors.field.tooLong";
  const documentNo = (value.documentNo ?? "").trim();
  if (Array.from(documentNo).length > MONEY_DOCUMENT_MAX) {
    fields.documentNo = "errors.field.tooLong";
  }
  if (!isBusinessDate(value.occurredOn)) fields.occurredOn = "errors.field.wrongFormat";
  if (Object.keys(fields).length > 0) throw new ActionError("invalid_input", fields);
  return {
    comment,
    documentNo: documentNo === "" ? null : documentNo,
    occurredOn: value.occurredOn,
  };
}

/** One Manager's part of the action: his orders given an amount above 0, in the lock order. */
type Block = { managerId: string; branchId: string; rows: { orderId: string; amount: bigint }[] };

/** The rows above 0, one block per Manager (the owner as locked, never from the input). */
function blocksOf(context: OrdersContext<RecordMoneyInput>): Block[] {
  const blocks = new Map<string, Block>();
  for (const order of context.orders) {
    const amount = context.input.amounts[order.id];
    if (amount === undefined || amount === 0n) continue;
    let block = blocks.get(order.ownerId);
    if (!block) {
      block = { managerId: order.ownerId, branchId: order.branchId, rows: [] };
      blocks.set(order.ownerId, block);
    }
    block.rows.push({ orderId: order.id, amount });
  }
  return [...blocks.values()];
}

/**
 * 08 Money ledger 3, against each order's count before the action: the field message that names
 * why a row would cross over, by order. The orders are locked, so no record or row of theirs is
 * written in between (every writer runs in the same wrapper).
 */
async function crossings(
  context: OrdersContext<RecordMoneyInput>,
  blocks: readonly Block[],
): Promise<OrderFailure[]> {
  const kind = context.input.kind;
  if (kind !== "CASH_RETURNED" && kind !== "PAID_BACK") return [];
  const ids = blocks.flatMap((block) => block.rows.map((row) => row.orderId));
  const rows = await moneyRowsOf(context.tx, ids);
  const records = await cashRecordsOf(context.tx, ids);
  const refused: OrderFailure[] = [];
  for (const block of blocks) {
    for (const { orderId, amount } of block.rows) {
      const count = orderCashCount(rows.get(orderId) ?? [], records.get(orderId) ?? []);
      const why = crossingRefusal(count, { kind, amount });
      if (why) {
        refused.push({
          orderId,
          code: "not_ready",
          fields: {
            amount: why === "ABOVE_COUNT" ? "errors.field.aboveCount" : "errors.field.aboveOwed",
          },
        });
      }
    }
  }
  return refused;
}

/** The file: the actor's own upload of a stored type that no record holds, locked FOR UPDATE. */
async function refuseFile(tx: Transaction, userId: string, fileId: string): Promise<void> {
  const [file] = await tx
    .select({ uploadedBy: files.uploadedBy, mime: files.mime })
    .from(files)
    .where(eq(files.id, fileId))
    .for("update");
  if (
    !file ||
    file.uploadedBy !== userId ||
    !(FILE_MIMES as readonly string[]).includes(file.mime) ||
    (await accessOf(tx, fileId)) !== null
  ) {
    throw new ActionError("invalid_input", { fileId: "errors.field.notAllowed" });
  }
}

/** The notice of each cash kind (10 Notifications); the information kinds have none. */
const NOTICE_OF: Partial<Record<MoneyRowKind, "CASH_GIVEN" | "CASH_RETURNED" | "CASH_PAID_BACK">> =
  {
    CASH_GIVEN: "CASH_GIVEN",
    CASH_RETURNED: "CASH_RETURNED",
    PAID_BACK: "CASH_PAID_BACK",
  };

export const recordMoney = defineOrdersAction<RecordMoneyInput>({
  name: "recordMoney",
  type: "RECORD_MONEY",
  input,
  permission: () => "money.record",
  repeatPermission: () => "money.record",
  reason: () => null,
  check(context) {
    storedFields(context.input);
    const blocks = blocksOf(context);
    const refused = context.orders
      .filter((order) => !moneyRecordAllows(order.status))
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
    if (refused.length > 0) return refused;
    if (blocks.length === 0) {
      throw new ActionError("invalid_input", { amounts: "errors.field.noAmount" });
    }
    const branchOf = new Map<string, LockedOrder>(context.orders.map((order) => [order.id, order]));
    for (const block of blocks) {
      const inBranches = new Set(block.rows.map((row) => branchOf.get(row.orderId)!.branchId));
      if (inBranches.size > 1) {
        throw new ActionError("invalid_input", { amounts: "errors.field.moneyOneBranch" });
      }
    }
    if (context.input.fileId && blocks.length > 1) {
      throw new ActionError("invalid_input", { fileId: "errors.field.fileOneManager" });
    }
    return [];
  },
  async write(context) {
    // After every check has passed, so a refusal here hides no other order's failure; a refusal
    // rolls back the `order_actions` row with everything else (06 rule 8).
    const refused = await crossings(context, blocksOf(context));
    if (refused.length > 0) throw new OrdersRefusal("not_ready", refused);
    if (context.input.fileId) await refuseFile(context.tx, context.userId, context.input.fileId);
    const { comment, documentNo, occurredOn } = storedFields(context.input);
    const at = now();
    const kind = context.input.kind;
    const extras = new Map<string, { payload: Record<string, unknown> }>();
    for (const block of blocksOf(context)) {
      const [action] = await context.tx
        .insert(moneyActions)
        .values({
          clientKey: context.input.clientKey,
          orderActionId: context.actionId,
          managerId: block.managerId,
          occurredOn,
          documentNo,
          fileId: context.input.fileId ?? null,
          comment,
          createdBy: context.userId,
          createdAt: at,
        })
        .returning({ id: moneyActions.id });
      await context.tx.insert(moneyRows).values(
        block.rows.map((row) => ({
          moneyActionId: action!.id,
          orderId: row.orderId,
          kind,
          amount: row.amount,
          createdAt: at,
        })),
      );
      for (const row of block.rows) {
        extras.set(row.orderId, {
          payload: { money: { actionId: action!.id, kind, amount: row.amount.toString() } },
        });
      }
    }
    return extras;
  },
  async notify(context, result) {
    const type = NOTICE_OF[context.input.kind];
    if (!type) return;
    const { tx, userId } = context;
    const at = now();
    const orderOf = new Map(context.orders.map((order) => [order.id, order]));
    for (const block of blocksOf(context)) {
      const moved = block.rows.map((row) => orderOf.get(row.orderId)!);
      for (const { branchId, params } of await branchNotices(tx, userId, moved)) {
        const amount = actionTotal(block.rows).toString();
        await notify(
          { tx, userId },
          {
            to: [block.managerId],
            type,
            params:
              type === "CASH_GIVEN" ? { ...params, amount, via: "money" } : { ...params, amount },
            branchId,
            link: actionLink(branchId, result.actionId),
            at,
          },
        );
      }
    }
  },
});
