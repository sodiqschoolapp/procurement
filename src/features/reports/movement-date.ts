import { sql } from "drizzle-orm";

// The one date and the one "undone" of a stock movement in the Reports (10-notifications-
// analytics-reports.md, Reports: Stock on hand, Stock movements; plan of 6.9a, decided item 5,
// Look first), so that Stock movements adds up to Stock on hand's two in-lines and to Use by
// department for the same dates. A movement is dated by its source's business date: a REVERSAL,
// which undoes later, by the Tashkent day it was written; a receipt by its record's date bought
// (the Purchase register's date, plan of 6.8, decided item 4); a document's movement by the
// document's date (as `analytics_stock_moves.moved_on`, plan of 6.4d, decided items 4 and 5).
// The statements name the movement `stock_movements`, its record `p` with trip `t`, and its document `d`.

export const MOVEMENT_DATE = sql`case
  when stock_movements.type = 'REVERSAL' then (stock_movements.created_at at time zone 'Asia/Tashkent')::date
  when stock_movements.purchase_id is not null then t.purchased_on
  when stock_movements.document_line_id is not null then d.doc_date
  else (stock_movements.created_at at time zone 'Asia/Tashkent')::date
end`;

/** The joins MOVEMENT_DATE reads: the record and its trip, the document through its line. */
export const MOVEMENT_SOURCES = sql`
  left join purchases p on p.id = stock_movements.purchase_id
  left join purchase_trips t on t.id = p.trip_id
  left join stock_document_lines l on l.id = stock_movements.document_line_id
  left join stock_documents d on d.id = l.document_id`;

/**
 * A movement a later REVERSAL undid: a cancelled record's receipt or a reversed document's
 * movement (09 Movement types, last paragraph; 07 cancel). A REVERSAL itself is never undone.
 */
export const UNDONE = sql`exists (select 1 from stock_movements r where r.reverses_movement_id = stock_movements.id)`;
