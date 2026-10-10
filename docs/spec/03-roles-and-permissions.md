# Roles and permissions

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Four roles exist, and what each user sees is limited to their branches on the server, not only on the screen.

| Role | Branches | Main jobs |
| --- | --- | --- |
| Head | All | Super admin. Manages catalogs, users, branches and settings. Gives the first approval. Acknowledges big overspends. Approves write-offs and stock corrections. Can do everything a Manager can, in any branch. |
| Manager | One or more, assigned by the Head | Creates requests, records purchases, runs the warehouse of their branches. |
| Principal | One branch per Principal, and exactly one Principal per branch | Gives the second approval. Sees requests, stock and reports of their branch, read-only. |
| Finance | One or more, assigned by the Head | Gives the third approval. Records money given and returned. Settles differences and closes requests. |

## Rules

1. Every read and every write checks role and branch on the server. Opening the address of another branch's request shows "Not found".
2. A branch has exactly one Principal. It can have several Managers and several Finance users; when users share a role, any of them can act and the first action wins.
3. Tasks belong to a role in a branch, not to a person. If one Finance user is away, another Finance user of that branch sees the same task. The Head can replace a branch's Principal at any time, for example with an acting Principal during leave. Waiting requests pass to the new Principal, and past approvals keep the old name.
4. At least one active Head must always exist. The last one cannot be deactivated.
5. The Head sees a warning when a branch has no active Manager, Principal or Finance user.
6. When the Head creates a request, the Head step is approved automatically and logged as "Created by Head".
7. A request has one owner: the Manager who created it. The Head can move it to another Manager of the same branch, but only when the owner's cash balance on it is zero.

## Manager rights the Head can switch

On each Manager's user page the Head sees nine switches, all on by default. Switching one off removes those buttons for that Manager at once, and the server refuses the action as well.

| Right | Code | When it is off |
| --- | --- | --- |
| Create and submit requests | `CREATE_REQUESTS` | The Manager can only view requests. |
| Record purchases | `RECORD_PURCHASES` | The Head records them, or moves the request to another Manager. |
| Cancel purchase records | `CANCEL_PURCHASES` | Only the Head can cancel a record. |
| Close exact-match requests alone | `CLOSE_ALONE` | Every request of this Manager goes to Finance for closing, even when all labels are green. |
| Issue stock to departments | `ISSUE_STOCK` | The Manager can view stock but not give items out. |
| Take returns and reverse documents | `RETURN_REVERSE` | Only the Head can do these. |
| Send transfers to other branches | `TRANSFER_STOCK` | Only the Head can send transfers. |
| Ask for write-offs and run stock counts | `WRITE_OFF_COUNT` | Only the Head can start them. |
| Set minimum stock levels | `SET_MINIMUMS` | Only the Head sets them. |

- A switch applies to the Manager in all of their branches.
- Switches only take rights away. No switch can give a Manager an action of the Head, the Principal or Finance.
- Every change is written to the audit log with the Head's name and the time, and the Manager is notified.
- Work already saved stays as it is. If a right is switched off in the middle of a task, the Head finishes it or moves the request to another Manager.

In the permission matrix below, a "Yes" for the Manager means "yes, when that right is on".

## Permission matrix

| Action | Head | Manager | Principal | Finance |
| --- | --- | --- | --- | --- |
| Manage catalogs, users, branches, settings | Yes | No | No | No |
| Suggest a new product for the catalog | Yes | Yes | No | No |
| Create, edit, submit, cancel a request | Yes, any branch | Yes, own branches | No | No |
| Approve, send back or reject at step 1 | Yes | No | No | No |
| Approve, send back or reject at step 2 | No | No | Yes, own branch | No |
| Approve, send back or reject at step 3 | No | No | No | Yes, own branches |
| Record money given, returned, paid back | No | No | No | Yes, own branches |
| Record purchases | Yes | Yes, own requests | No | No |
| Close a request that matches exactly | Yes | Yes, own requests | No | No |
| Settle and close a request with differences | No | No | No | Yes, own branches |
| Acknowledge a big overspend | Yes | No | No | No |
| Reopen a closed request | Yes | No | No | No |
| Issue, return, transfer stock | Yes | Yes, own branches | No | No |
| Ask for a write-off or stock correction | Yes | Yes, own branches | No | No |
| Approve a write-off or stock correction | Yes | No | No | No |
| See requests, stock and reports | All branches | Own branches | Own branch | Own branches |
| Export to Excel, download PDF, print | Yes | Yes | Yes | Yes |
| Enter stock directly, without a request | Yes | No | No | No |
| Add a new price for a product | Yes | No | No | No |
| Switch a Manager's rights on or off | Yes | No | No | No |
