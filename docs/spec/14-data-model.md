# Data model

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The database has 35 tables in five groups, plus the session tables the login library creates. The users table is the login library's user table with the extra columns shown. Every table has `created_at`. Every table also has `id` (UUID) unless a different key is shown: a table with its own key has no `id`. Values in square brackets are enums.

## Organisation and catalogs

```text
branches             name, code UNIQUE, address, is_active
users                full_name, username UNIQUE, phone, role [HEAD|MANAGER|PRINCIPAL|FINANCE],
                     locale [uz|ru|en], is_active,
                     last_login_at
user_branches        user_id, branch_id                      KEY (user_id, branch_id)
                     -- no rows for HEAD, exactly one row for PRINCIPAL,
                     -- and at most one active PRINCIPAL per branch
manager_rights       user_id, right [the nine codes in section 3], enabled
                     KEY (user_id, right)                    -- no row means enabled
units                name, short_name, allow_decimal, is_active
categories           name, is_active
companies            name, kind [BRAND|SUPPLIER|BOTH], tax_id, phone, note, is_active
extra_cost_types     name, is_active
departments          branch_id, name, responsible_name, responsible_phone, is_active
products             name, type [GOODS|SERVICE], category_id, unit_id, photo_file_id,
                     default_company_id, reference_price, description, has_variants, is_active
product_variants     product_id, name, is_default, photo_file_id, reference_price,
                     last_purchase_price, last_purchase_at, is_active
price_history        variant_id, price, source [HEAD|PURCHASE], note, set_by, purchase_id
                     -- one row each time the Head sets a price or a purchase is recorded
stock_minimums       branch_id, variant_id, min_qty          KEY (branch_id, variant_id)
catalog_suggestions  branch_id, suggested_by, name, unit_text, photo_file_id, note,
                     status [PENDING|ADDED|DECLINED], decided_by, decision_note, product_id
files                storage_key, original_name, mime, size_bytes, uploaded_by
```

## Orders

```text
number_counters      scope [ORD|ISS|RET|TRF|WOF|CNT|ENT], branch_id, year, last_value
                     KEY (scope, branch_id, year)
orders               number UNIQUE (empty while Draft), revision, branch_id, owner_id,
                     status [DRAFT|PENDING_HEAD|PENDING_PRINCIPAL|PENDING_FINANCE|RETURNED|
                             PURCHASING|SETTLEMENT|CLOSED|REJECTED|CANCELLED],
                     priority [NORMAL|URGENT], urgent_reason, version,
                     variant_id, company_id, department_id, requester_name, needed_by,
                     planned_qty, planned_price, payment_type [CASH|TRANSFER|CARD], comment,
                     reference_photo_file_id, stock_at_submit,
                     progress [OPEN|DONE|DONE_SHORT|NOT_BOUGHT], finish_reason,
                     planned_total, actual_total, submitted_at, approved_at, closed_at,
                     created_by, updated_at
                     -- one never-submitted draft (number empty) per owner, branch, subtype and
                     -- department (partial unique index)
order_extras         order_id, extra_cost_type_id, amount
order_revisions      order_id, revision, snapshot JSONB      -- full copy at each submit
order_actions        client_key UNIQUE, type, actor_id, reason, order_count
                     -- one user action on one or more ticked orders
order_events         order_id, action_id, type, from_status, to_status, actor_id,
                     comment, note, payload JSONB            -- note: the per-order note on "send back"
```

## Purchasing and money

```text
purchase_trips       client_key UNIQUE, branch_id, purchased_on, supplier_id,
                     payment_type [CASH|TRANSFER|CARD], created_by
                     -- one shop visit; holds one or more purchase records
purchases            trip_id, order_id, variant_id, qty, unit_price, comment,
                     -- date, supplier and payment type are the trip's, never copied
                     give_to_requester, is_cancelled, cancel_reason, cancelled_by,
                     cancelled_at, created_by
purchase_extras      purchase_id, extra_cost_type_id, amount, payment_type [CASH|TRANSFER|CARD]
trip_files           trip_id, file_id                        KEY (trip_id, file_id)
money_actions        client_key, order_action_id, manager_id, occurred_on, supplier_id, document_no,
                     file_id, comment, is_cancelled, cancel_reason, cancelled_by,
                     cancelled_at, created_by
                     UNIQUE (client_key, manager_id)          -- one browser id can save one action per Manager
                     -- order_action_id: the approval or settlement it was saved with; empty on the Money tab
money_rows           money_action_id, order_id,
                     kind [CASH_GIVEN|CASH_RETURNED|PAID_BACK|BANK_TRANSFER|CARD_TOPUP|CARD_RETURNED],
                     amount CHECK (amount > 0)
order_settlements    order_id KEY, transfer_confirmed_by, transfer_confirmed_at, transfer_note,
                     card_confirmed_by, card_confirmed_at,
                     overspend_ack_by, overspend_ack_at, overspend_ack_comment
```

## Warehouse

```text
stock_balances       branch_id, variant_id, qty CHECK (qty >= 0), avg_cost, updated_at
                     KEY (branch_id, variant_id)
stock_documents      number UNIQUE, type [ISSUE|RETURN|TRANSFER|WRITE_OFF|COUNT|DIRECT_ENTRY],
                     branch_id, to_branch_id, department_id, received_by_name, doc_date,
                     status [PENDING_APPROVAL|POSTED|IN_TRANSIT|RECEIVED|REJECTED|REVERSED|CANCELLED],
                     reason, comment, client_key UNIQUE, created_by, decided_by, decided_at,
                     decision_reason
stock_document_lines document_id, variant_id, qty, counted_qty, received_qty, unit_cost
stock_movements      branch_id, variant_id,
                     type [RECEIPT|ISSUE|RETURN|TRANSFER_OUT|TRANSFER_IN|WRITE_OFF|
                           CORRECTION|DIRECT_ENTRY|REVERSAL],
                     qty_delta, unit_cost, balance_after, purchase_id, document_line_id,
                     reverses_movement_id, created_by            -- append-only
```

## System

```text
notifications        user_id, branch_id (empty for a notice of no branch), type, params JSONB, link, read_at
settings             key KEY, value JSONB
audit_log            actor_id, action, entity, entity_id, before JSONB, after JSONB
sessions, accounts, verifications                            -- created by the login library
```

## Notes for the build

- `stock_balances` is a running total kept in step with `stock_movements` inside the same transaction. A nightly job recomputes it from the movements and reports any mismatch.
- `orders.planned_total` and `orders.actual_total` are cached values for fast lists. They are recalculated by the shared domain functions in the same transaction as any change.
- `client_key` is the browser-made ID that makes repeated saves safe (rule 8 in section 13). A partial unique index allows only one active Principal per branch. The analytics summary tables are materialized views built from these tables and are not counted above. One more settings key, `school_year_start`, holds the first day of the school year as a month and day; it has no default.
- Settings keys: `default_payment_type`, `price_hint_percent` (20), `overspend_guard_percent` (10), `overspend_guard_min_amount` (100 000), `reminder_hours` (24), `escalation_hours` (48), `receipt_required_for_cash` (false), `school_name`. The logo and the colours are part of the design system, not settings.
