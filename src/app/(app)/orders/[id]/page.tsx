import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import {
  ColourLabels,
  ProgressLabel,
  RequestStatusLabel,
  SubstitutedLabel,
} from "@/components/status-label";
import { TabLinks } from "@/components/tab-links";
import { waitingFor } from "@/domain/order-steps";
import { BUYING_STATUSES } from "@/domain/purchases";
import { OrderActionBar } from "@/features/orders/components/order-action-bar";
import type { StatusMoveKind } from "@/features/orders/components/move-button";
import { OrderHistory } from "@/features/orders/components/order-history";
import { OrderStepper } from "@/features/orders/components/order-stepper";
import { PlanActualTable } from "@/features/orders/components/plan-actual-table";
import { WhatChanged } from "@/features/orders/components/what-changed";
import { type OrderPage, getOrderPage } from "@/features/orders/queries/order-page";
import { PurchasesTab } from "@/features/purchasing/components/purchases-tab";
import { MoneyTab } from "@/features/money/components/money-tab";
import { getOrderMoney } from "@/features/money/queries/order-money";
import { wireColours } from "@/features/orders/list-wire";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

// /orders/[id] (11-screens-and-ux.md, Screens: "Order page | All"; Order page layout 1 to 4; plan
// of 2.9). Another branch's order, another user's Draft, an unknown or a malformed id are all "Not
// found" (03 rule 1; decided item 6, Look first): getOrderPage() answers null for each. The tabs
// are Details, Purchases from status Open on (plan of 3.5) and History, kept in the address
// (`?tab=purchases`, `?tab=money`, `?tab=history`; decided item 10); Money from 4.3, as Purchases. The action bar shows the moves the server allowed that have a
// button, and otherwise who the order is waiting for (decided items 4 and 5, Look first).

type Tab = "details" | "purchases" | "money" | "history";

/** The bar's move buttons besides Submit and Approve, in the table's order (06 Allowed moves). */
const PAGE_MOVES: readonly StatusMoveKind[] = [
  "SEND_BACK",
  "REJECT",
  "TAKE_BACK",
  "SUBMIT_AGAIN",
  "CANCEL",
  "CLOSE_EXACT",
  "CLOSE_SKIPPED",
  "SEND_TO_SETTLEMENT",
  "SEND_BACK_FOR_CORRECTION",
  "CLOSE",
  "REOPEN",
];

/** The waiting line, or null when the user has an allowed move (decided item 4, Look first). */
async function waitingLine(order: OrderPage): Promise<string | null> {
  if (
    order.actions.length > 0 ||
    order.canRecordPurchase ||
    order.canRecordMoney ||
    order.canSettle ||
    order.canAcknowledgeOverspend ||
    order.buying.length > 0
  ) {
    return null;
  }
  const t = await getTranslations("orders.page.waiting");
  const who = waitingFor(order.status);
  if (who === "PRINCIPAL") {
    return order.principalName
      ? t("PRINCIPAL", { branch: order.branchCode, name: order.principalName })
      : t("PRINCIPAL_NONE", { branch: order.branchCode });
  }
  if (who === "FINANCE") return t("FINANCE", { branch: order.branchCode });
  if (who === "OWNER") return t("OWNER", { name: order.ownerName });
  return t(who);
}

export default async function OrderPageScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const order = await getOrderPage(user.id, id);
  if (!order) notFound();
  const asked = (await searchParams).tab;
  // The Purchases tab exists from status Open on (plan of 3.5, decided item 11).
  const hasPurchases = BUYING_STATUSES.has(order.status);
  // An order that skipped Finance has no Money tab (11 Order page layout 3; plan of 4.10c).
  const hasMoney = hasPurchases && !order.skippedFinance;
  const tab: Tab =
    asked === "history"
      ? "history"
      : asked === "purchases" && hasPurchases
        ? "purchases"
        : asked === "money" && hasMoney
          ? "money"
          : "details";
  // The Money tab, from Open on as Purchases (plan of 4.3, decided item 11), read only when shown.
  const money = tab === "money" ? await getOrderMoney(user.id, order.id) : null;
  if (tab === "money" && !money) notFound();

  const t = await getTranslations("orders.page");
  const tOrders = await getTranslations("orders");
  const tPayment = await getTranslations("paymentTypes");
  const format = await getFormatters();
  const line = await waitingLine(order);

  const product = order.productName
    ? order.subtypeName
      ? `${order.productName} · ${order.subtypeName}`
      : order.productName
    : t("details.notSet");
  const hint =
    order.priceHint === null
      ? null
      : tOrders("priceHint", { percent: order.priceHint as unknown as number });
  const when = (moment: Date | null) =>
    moment
      ? t("details.at", { date: format.date(moment), time: format.time(moment) })
      : t("details.notSet");

  // A field with nothing in it is not shown (redesign of 21.10.2026: no "Not given" rows).
  const NONE = Symbol("none");
  const fact = (key: string, label: string, value: React.ReactNode | typeof NONE) =>
    value === NONE ? null : (
      <div key={key} data-fact={key} className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm break-words">{value}</dd>
      </div>
    );

  const details = (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
      {fact("requester", t("details.requester"), order.requesterName ?? NONE)}
      {fact(
        "neededBy",
        t("details.neededBy"),
        order.neededBy ? format.date(order.neededBy) : t("details.notSet"),
      )}
      {fact(
        "quantity",
        t("details.quantity"),
        order.quantity
          ? `${format.quantity(order.quantity)} ${order.unitShortName ?? ""}`.trim()
          : t("details.notSet"),
      )}
      {fact(
        "price",
        t("details.price"),
        order.price === null ? (
          t("details.notSet")
        ) : (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular-nums">{format.money(order.price)}</span>
            {hint ? (
              <span data-price-hint className="text-small font-semibold text-warning">
                {hint}
              </span>
            ) : null}
          </span>
        ),
      )}
      {fact(
        "extras",
        t("details.extras"),
        order.extras.length === 0 ? (
          NONE
        ) : (
          <ul className="flex flex-col">
            {order.extras.map((extra, index) => (
              <li key={index} className="tabular-nums">
                {t("details.extraLine", {
                  type: extra.typeName,
                  amount: format.money(extra.amount),
                })}
              </li>
            ))}
          </ul>
        ),
      )}
      {order.received !== null
        ? fact(
            "received",
            // 07 What saving a record does: a service shows Used where a product shows Received.
            t(order.isService ? "details.used" : "details.received"),
            t("details.receivedOf", {
              received: format.quantity(order.received),
              planned: format.quantity(order.quantity ?? "0"),
              unit: order.unitShortName ?? "",
            }),
          )
        : null}
      {order.number
        ? [
            fact(
              "stockAtSubmit",
              t("details.stockAtSubmit"),
              order.stockAtSubmit === null
                ? t("details.noStock")
                : `${format.quantity(order.stockAtSubmit)} ${order.unitShortName ?? ""}`.trim(),
            ),
            fact(
              "stockNow",
              t("details.stockNow"),
              order.stockNow === null
                ? t("details.noStock")
                : `${format.quantity(order.stockNow)} ${order.unitShortName ?? ""}`.trim(),
            ),
          ]
        : null}
      {fact("paymentType", t("details.paymentType"), tPayment(order.paymentType))}
      {fact(
        "priority",
        t("details.priority"),
        order.priority === "URGENT" ? t("details.urgent") : t("details.normal"),
      )}
      {order.priority === "URGENT"
        ? fact("urgentReason", t("details.urgentReason"), order.urgentReason ?? NONE)
        : null}
      {fact("company", t("details.company"), order.companyName ?? NONE)}
      {fact("comment", t("details.comment"), order.comment ?? NONE)}
      {fact(
        "photo",
        t("details.photo"),
        order.referencePhotoFileId ? (
          <a
            href={`/files/${order.referencePhotoFileId}/large`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline underline-offset-2"
          >
            {t("details.openPhoto")}
          </a>
        ) : (
          NONE
        ),
      )}
      {fact(
        "submittedAt",
        t("details.submittedAt"),
        order.submittedAt ? when(order.submittedAt) : NONE,
      )}
      {order.approvedAt
        ? fact("approvedAt", t("details.approvedAt"), when(order.approvedAt))
        : null}
      {order.closedAt ? fact("closedAt", t("details.closedAt"), when(order.closedAt)) : null}
    </dl>
  );

  const branchText = `${order.branchCode} · ${order.branchName}`;
  const tabs: Tab[] = hasMoney
    ? ["details", "purchases", "money", "history"]
    : hasPurchases
      ? ["details", "purchases", "history"]
      : ["details", "history"];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3">
        <Link
          href="/orders"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
        >
          <Icon name="arrow_back" size={16} />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 data-order-number className="text-title">
            {order.number ?? t("noNumber")}
          </h1>
          {order.number ? (
            <span data-revision className="text-sm text-muted-foreground">
              {tOrders("revision", { revision: order.revision })}
            </span>
          ) : null}
          <RequestStatusLabel status={order.status} />
          {/* Open buying says no more than the status Open beside it (redesign of 22.10.2026). */}
          {order.status === "PURCHASING" && order.progress !== "OPEN" ? (
            <ProgressLabel progress={order.progress} />
          ) : null}
          {order.substituted ? <SubstitutedLabel /> : null}
          {order.priority === "URGENT" ? (
            <span className="inline-flex items-center gap-1 text-small font-medium text-destructive">
              <Icon name="warning" size={16} />
              {t("urgent", { reason: order.urgentReason ?? "" })}
            </span>
          ) : null}
          {order.overdue ? (
            <span
              data-overdue
              className="inline-flex items-center gap-1 text-small font-medium text-warning"
            >
              <Icon name="schedule" size={16} />
              {tOrders("overdue")}
            </span>
          ) : null}
        </div>
        <p data-fact="product" className="text-heading">
          <span className="sr-only">{t("product")} </span>
          {product}
        </p>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <div data-fact="branch" className="flex gap-1.5">
            <dt className="sr-only">{t("branch")}</dt>
            <dd>{branchText}</dd>
          </div>
          <div data-fact="owner" className="flex gap-1.5">
            <dt>{t("owner")}</dt>
            <dd className="text-foreground">{order.ownerName}</dd>
          </div>
          {order.departmentName ? (
            <div data-fact="department" className="flex gap-1.5">
              <dt>{t("department")}</dt>
              <dd className="text-foreground">{order.departmentName}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <OrderActionBar
        orderId={order.id}
        version={order.version}
        canSubmit={order.actions.includes("SUBMIT")}
        approve={
          order.actions.includes("APPROVE") && order.number && order.plannedTotal !== null
            ? {
                order: {
                  id: order.id,
                  number: order.number,
                  status: order.status,
                  paymentType: order.paymentType,
                  plannedTotal: order.plannedTotal.toString(),
                  owner: { id: order.ownerId, name: order.ownerName },
                },
                total: format.money(order.plannedTotal),
                financeStep: order.financeStep,
              }
            : null
        }
        moves={[
          ...PAGE_MOVES.filter((move) => order.actions.includes(move)),
          ...order.buying,
          // The Head's Acknowledge overspend (08 Overspend guard; plan of 4.7): the server's flag.
          ...(order.canAcknowledgeOverspend ? (["ACKNOWLEDGE_OVERSPEND"] as const) : []),
        ]}
        number={order.number}
        // Copy as new of a numbered order; a draft is edited in the drafts grid (decided item 11).
        canCopy={order.canCopy && order.status !== "DRAFT" && order.number !== null}
        recordPurchase={order.canRecordPurchase ? `/orders/${order.id}/purchase` : null}
        canRecordMoney={order.canRecordMoney}
        settle={order.canSettle ? `/orders/settle?ids=${order.id}` : null}
        waitingLine={line}
        skippedFinance={order.skippedFinance}
      />

      <section
        aria-label={t("totals")}
        className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,2fr)]"
      >
        <div
          data-fact="plannedTotal"
          className="flex flex-col gap-1 border-r border-border px-4 py-3 sm:px-5 sm:py-4"
        >
          <span className="text-xs text-muted-foreground">{t("plannedTotal")}</span>
          {order.plannedTotal === null ? (
            <span className="py-1 text-sm text-muted-foreground">{t("details.notSet")}</span>
          ) : (
            <span className="text-figure font-semibold tabular-nums">
              {format.money(order.plannedTotal)}
            </span>
          )}
          {hint ? <span className="text-xs text-warning">{hint}</span> : null}
        </div>
        <div
          data-fact="actualTotal"
          className="flex flex-col gap-1 px-4 py-3 sm:border-r sm:border-border sm:px-5 sm:py-4"
        >
          <span className="text-xs text-muted-foreground">{t("actualTotal")}</span>
          {order.actualTotal === null || order.received === "0" ? (
            <span className="py-1 text-sm text-muted-foreground">{t("notBought")}</span>
          ) : (
            <span className="text-figure font-semibold tabular-nums">
              {format.money(order.actualTotal)}
            </span>
          )}
        </div>
        {/* 08 The three colours, from Open on (11 Order page layout 1; plan of 3.8). */}
        {order.colours ? (
          <div className="col-span-2 flex flex-col justify-center gap-2 border-t border-border px-4 py-3 sm:col-span-1 sm:border-t-0 sm:px-5 sm:py-4">
            <span className="text-xs text-muted-foreground">{t("outcome")}</span>
            <ColourLabels colours={wireColours(order.colours)!} />
          </div>
        ) : null}
      </section>

      {order.planVsActual && order.colours ? (
        <PlanActualTable
          table={order.planVsActual}
          colours={order.colours}
          unit={order.unitShortName ?? ""}
        />
      ) : null}

      <OrderStepper steps={order.steps} />

      {order.changes && order.changes.list.length > 0 ? (
        <WhatChanged
          since={order.changes.since}
          changes={order.changes.list}
          unit={order.unitShortName}
        />
      ) : null}

      <section className="flex flex-col gap-4">
        <TabLinks
          label={t("tabs.label")}
          tabs={tabs.map((to) => ({
            id: to,
            href: to === "details" ? `/orders/${order.id}` : `/orders/${order.id}?tab=${to}`,
            label: t(`tabs.${to}`),
            current: tab === to,
          }))}
        />
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="sr-only">{t(`${tab}.title`)}</h2>
          {tab === "details" ? (
            details
          ) : tab === "purchases" ? (
            <PurchasesTab order={order} />
          ) : tab === "money" && money ? (
            <MoneyTab money={money} />
          ) : (
            <OrderHistory events={order.events} />
          )}
        </div>
      </section>
    </div>
  );
}
