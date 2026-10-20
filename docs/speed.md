# Speed

Build plan 9.2: every page measured at the volume of several school years (01-summary.md, Quality bar: "Any page opens in under 1 second"; edge-cases/developer-rules.md rule 12). Written by `npm run speed` (`tests/speed/pages.spec.ts`); do not edit the tables by hand.

## How it was measured

- 2026-10-20, 4 CPU threads (Intel(R) Xeon(R) Processor @ 2.10GHz), 16 GiB memory; PostgreSQL 17 of `docker-compose.yml` on the same machine.
- A production build (`next build`, then `next start`) against `procurement_speed`, filled by `tests/speed/fill.ts`; the scheduler off.
- Chromium at 1440 × 900, one page at a time. Each address is opened once to warm up, then three times. A load runs from navigation start until the load event has ended and no loading area (`aria-busy="true"`) is left. Prefetch requests are aborted.
- Statements: those PostgreSQL logged between two marker statements around the last of the three loads, the page's sign-in check included.
- One analytics refresh on this volume took 23.3 s (it runs every 5 minutes in the background; no page waits for it).

## Volume

| Table | Rows |
| --- | --- |
| `orders` | 36 000 |
| `order_events` | 235 045 |
| `order_actions` | 111 349 |
| `purchases` | 32 602 |
| `stock_movements` | 61 952 |
| `stock_documents` | 24 662 |
| `money_rows` | 34 692 |
| `notifications` | 114 425 |
| `product_variants` | 2 000 |
| `users` | 30 |

## What task 9.2 changed

- Migration `0049_speed_indexes.sql`: every foreign key is led by an index of its own columns (13 single-column indexes became the composite of their key), and every filter column has its index or is read through the key of one (`tests/indexes.db.test.ts`).
- Eight Analytics totals read their whole summary table and filtered inside the sums; they now read only the rows of the two periods (`where (now) or (then)`). Finance's Analytics went from about 1 000 ms to about 400 ms.
- JIT is off on the app's connections: it spent about 270 of 310 ms of one Analytics count compiling.
- The Analytics drill-downs show 25 rows a page (rule 8), not 50.

## Queries in loops

No statement count grows with the rows of a page: a list's first page (25 rows) and its last page (fewer) send the same number. The notifications list is not a table; its 25 a page is proved by `src/features/notifications/queries/my-notifications.db.test.ts`.

## Pages

| Address | As | Note | Median ms | Slowest ms | Statements | Under 1 s |
| --- | --- | --- | --- | --- | --- | --- |
| `/login` | signed out |  | 158 | 167 | 0 | yes |
| `/` | head |  | 376 | 378 | 69 | yes |
| `/analytics` | head |  | 576 | 679 | 79 | yes |
| `/` | manager |  | 378 | 392 | 41 | yes |
| `/analytics` | manager |  | 393 | 443 | 46 | yes |
| `/` | principal |  | 362 | 381 | 25 | yes |
| `/analytics` | principal |  | 394 | 404 | 60 | yes |
| `/` | finance |  | 375 | 392 | 33 | yes |
| `/analytics` | finance |  | 392 | 425 | 53 | yes |
| `/analytics/approvals?period=this_month&branch=all&key=step:all` | head |  | 170 | 181 | 15 | yes |
| `/analytics/cancelled?period=this_month&branch=all` | head |  | 163 | 164 | 15 | yes |
| `/analytics/cash-needed?period=this_month&branch=all&key=needed:all` | finance |  | 173 | 173 | 14 | yes |
| `/analytics/cash?period=this_month&branch=all` | finance |  | 176 | 202 | 13 | yes |
| `/analytics/money?period=this_month&branch=all&key=money:given` | finance |  | 183 | 200 | 15 | yes |
| `/analytics/moves?period=this_month&branch=all&key=moves:use` | head |  | 177 | 192 | 15 | yes |
| `/analytics/order-status?period=this_month&branch=all&key=status:all` | principal |  | 181 | 396 | 13 | yes |
| `/analytics/orders?period=this_month&branch=all` | head |  | 193 | 237 | 15 | yes |
| `/analytics/records?period=this_month&branch=all` | head |  | 184 | 206 | 15 | yes |
| `/analytics/settlements?period=this_month&branch=all&key=settled` | finance |  | 176 | 199 | 15 | yes |
| `/analytics/stock?period=this_month&branch=all&key=stock:value` | head |  | 171 | 198 | 14 | yes |
| `/branches` | head |  | 174 | 226 | 12 | yes |
| `/branches/new` | head |  | 189 | 193 | 12 | yes |
| `/branches/<id>` | head |  | 188 | 191 | 14 | yes |
| `/catalog` | head |  | 181 | 206 | 13 | yes |
| `/catalog/measures` | head |  | 155 | 182 | 12 | yes |
| `/catalog/companies/new` | head |  | 176 | 190 | 11 | yes |
| `/catalog/measures/<id>` | head |  | 207 | 232 | 13 | yes |
| `/catalog/departments` | head |  | 191 | 212 | 14 | yes |
| `/catalog/departments/new` | head |  | 194 | 221 | 12 | yes |
| `/catalog/departments/<id>` | head |  | 188 | 190 | 13 | yes |
| `/catalog/import/products` | head |  | 183 | 222 | 10 | yes |
| `/catalog/products` | head |  | 197 | 264 | 14 | yes |
| `/catalog/products/new` | head |  | 203 | 256 | 13 | yes |
| `/catalog/products/<id>` | head |  | 220 | 227 | 20 | yes |
| `/catalog/products/<id>/subtypes/new` | head |  | 179 | 202 | 12 | yes |
| `/catalog/products/<id>/subtypes/<id>` | head |  | 188 | 202 | 15 | yes |
| `/money` | head |  | 389 | 393 | 17 | yes |
| `/money` | finance |  | 391 | 393 | 17 | yes |
| `/notifications` | manager |  | 158 | 192 | 13 | yes |
| `/orders` | manager |  | 389 | 390 | 32 | yes |
| `/orders` | head |  | 374 | 393 | 30 | yes |
| `/orders/<id>` | manager | draft | 158 | 178 | 21 | yes |
| `/orders/<id>` | head | waiting for Head | 179 | 196 | 21 | yes |
| `/orders/<id>` | manager | open | 188 | 392 | 23 | yes |
| `/orders/<id>` | finance | waiting for settlement | 173 | 313 | 26 | yes |
| `/orders/<id>/purchase` | manager |  | 181 | 204 | 19 | yes |
| `/orders/purchase?ids=<id>` | manager |  | 183 | 206 | 19 | yes |
| `/orders/settle?ids=<id>` | finance |  | 188 | 191 | 21 | yes |
| `/prices` | head |  | 205 | 240 | 14 | yes |
| `/prices/<id>` | head |  | 189 | 242 | 13 | yes |
| `/profile` | manager |  | 160 | 190 | 9 | yes |
| `/reports` | head |  | 230 | 423 | 24 | yes |
| `/settings` | head |  | 170 | 209 | 13 | yes |
| `/suggestions` | manager |  | 193 | 384 | 14 | yes |
| `/suggestions/new` | manager |  | 164 | 180 | 14 | yes |
| `/suggestions/<id>` | head |  | 170 | 200 | 12 | yes |
| `/suggestions/<id>/add` | head |  | 181 | 218 | 16 | yes |
| `/users` | head |  | 172 | 191 | 16 | yes |
| `/users/new` | head |  | 192 | 239 | 12 | yes |
| `/users/<id>` | head |  | 183 | 233 | 22 | yes |
| `/warehouse/counts` | manager |  | 173 | 177 | 20 | yes |
| `/warehouse/documents` | manager |  | 253 | 408 | 27 | yes |
| `/warehouse/documents/new?type=ISSUE` | manager |  | 188 | 201 | 13 | yes |
| `/warehouse/documents/<id>` | manager |  | 178 | 204 | 14 | yes |
| `/warehouse/items/<id>?branch=<id>` | manager |  | 206 | 214 | 15 | yes |
| `/warehouse/stock` | manager |  | 382 | 409 | 28 | yes |
| `/warehouse/stock` | head |  | 189 | 398 | 30 | yes |
| `/orders` | head | first page | 389 | 407 | 30 | yes |
| `/orders?page=9999` | head | last page | 391 | 405 | 30 | yes |
| `/orders?status=CLOSED&payment=CASH&sort=submitted` | head | filtered and sorted | 409 | 424 | 30 | yes |
| `/orders` | manager | first page | 376 | 405 | 32 | yes |
| `/orders?page=9999` | manager | last page | 375 | 388 | 32 | yes |
| `/orders?branch=<id>&sort=product` | manager | filtered and sorted | 388 | 392 | 33 | yes |
| `/warehouse/documents` | head | first page | 374 | 417 | 28 | yes |
| `/warehouse/documents?page=9999` | head | last page | 389 | 392 | 28 | yes |
| `/warehouse/documents?type=ISSUE&branch=<id>` | head | filtered and sorted | 222 | 422 | 30 | yes |
| `/warehouse/stock` | head | first page | 388 | 412 | 30 | yes |
| `/warehouse/stock?page=9999` | head | last page | 388 | 392 | 30 | yes |
| `/warehouse/stock?q=Mahsulot%201&low=1` | head | filtered and sorted | 404 | 406 | 30 | yes |
| `/notifications` | head | first page | 217 | 390 | 13 | yes |
| `/notifications?page=9999` | head | last page | 190 | 210 | 26 | yes |
| `/notifications?page=2` | head | filtered and sorted | 225 | 268 | 13 | yes |
| `/catalog/products` | head | first page | 206 | 263 | 14 | yes |
| `/catalog/products?page=9999` | head | last page | 239 | 332 | 14 | yes |
| `/catalog/products?q=Mahsulot%201&type=GOODS` | head | filtered and sorted | 206 | 231 | 14 | yes |
| `/prices` | head | first page | 213 | 246 | 14 | yes |
| `/prices?page=9999` | head | last page | 296 | 307 | 14 | yes |
| `/prices?q=Tur` | head | filtered and sorted | 240 | 244 | 14 | yes |
| `/users` | head | first page | 189 | 207 | 16 | yes |
| `/users?page=9999` | head | last page | 171 | 217 | 16 | yes |
| `/users?page=2` | head | filtered and sorted | 211 | 262 | 16 | yes |
