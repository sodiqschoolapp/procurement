import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import { ProgressLabel, RequestStatusLabel } from "@/components/status-label";
import { cn } from "@/components/utils";
import { waitingFor } from "@/domain/order-steps";
import { BUYING_STATUSES } from "@/domain/purchases";
import { OrderActionBar } from "@/features/orders/components/order-action-bar";
import type { StatusMoveKind } from "@/features/orders/components/move-button";
import { OrderHistory } from "@/features/orders/components/order-history";
import { OrderStepper } from "@/features/orders/components/order-stepper";
import { WhatChanged } from "@/features/orders/components/what-changed";
import { type OrderPage, getOrderPage } from "@/features/orders/queries/order-page";
import { PurchasesTab } from "@/features/purchasing/components/purchases-tab";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

// /orders/[id] (11-screens-and-ux.md, Screens: "Order page | All"; Order page layout 1 to 4; plan
// of 2.9). Another branch's order, another user's Draft, an unknown or a malformed id are all "Not
// found" (03 rule 1; decided item 6, Look first): getOrderPage() answers null for each. The tabs
// are Details, Purchases from status Open on (plan of 3.5) and History, kept in the address
// (`?tab=purchases`, `?tab=history`; decided item 10); Money arrives with 4.3. The action bar shows the moves the server allowed that have a
// button, and otherwise who the order is waiting for (decided items 4 and 5, Look first).

type Tab = "details" | "purchases" | "history";

/** The bar's move buttons besides Submit and Approve, in the table's order (06 Allowed moves). */
const PAGE_MOVES: readonly StatusMoveKind[] = [
  "SEND_BACK",
  "REJECT",
  "TAKE_BACK",
  "SUBMIT_AGAIN",
  "CANCEL",
];

/** The waiting line, or null when the user has an allowed move (decided item 4, Look first). */
async function waitingLine(order: OrderPage): Promise<string | null> {
  if (order.actions.length > 0 || order.canRecordPurchase || order.buying.length > 0) return null;
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
  const tab: Tab =
    asked === "history"
      ? "history"
      : asked === "purchases" && hasPurchases
        ? "purchases"
        : "details";

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

  const fact = (key: string, label: string, value: React.ReactNode) => (
    <div key={key} data-fact={key} className="flex flex-col gap-0.5">
      <dt className="text-[13px] leading-[18px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] leading-[22px] break-words">{value}</dd>
    </div>
  );

  const details = (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fact("requester", t("details.requester"), order.requesterName ?? t("details.notSet"))}
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
              <span data-price-hint className="text-[13px] font-semibold text-warning">
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
          t("details.extrasNone")
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
        ? fact("urgentReason", t("details.urgentReason"), order.urgentReason ?? t("details.notSet"))
        : null}
      {fact("company", t("details.company"), order.companyName ?? t("details.notSet"))}
      {fact("comment", t("details.comment"), order.comment ?? t("details.notSet"))}
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
          t("details.notSet")
        ),
      )}
      {fact("submittedAt", t("details.submittedAt"), when(order.submittedAt))}
      {order.approvedAt
        ? fact("approvedAt", t("details.approvedAt"), when(order.approvedAt))
        : null}
      {order.closedAt ? fact("closedAt", t("details.closedAt"), when(order.closedAt)) : null}
    </dl>
  );

  const tabLink = (to: Tab) => (
    <Link
      key={to}
      href={to === "details" ? `/orders/${order.id}` : `/orders/${order.id}?tab=${to}`}
      aria-current={tab === to ? "page" : undefined}
      className={cn(
        "flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-[15px] font-semibold sm:flex-none",
        tab === to ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {t(`tabs.${to}`)}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 data-order-number className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
            {order.number ?? t("noNumber")}
          </h1>
          {order.number ? (
            <span data-revision className="text-[15px] leading-[22px] text-muted-foreground">
              {tOrders("revision", { revision: order.revision })}
            </span>
          ) : null}
          <RequestStatusLabel status={order.status} />
          {order.status === "PURCHASING" ? <ProgressLabel progress={order.progress} /> : null}
          {order.priority === "URGENT" ? (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-destructive">
              <Icon name="warning" size={16} />
              {t("urgent", { reason: order.urgentReason ?? "" })}
            </span>
          ) : null}
          {order.overdue ? (
            <span
              data-overdue
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-warning"
            >
              <Icon name="schedule" size={16} />
              {tOrders("overdue")}
            </span>
          ) : null}
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fact("product", t("product"), product)}
          {fact("branch", t("branch"), `${order.branchCode} · ${order.branchName}`)}
          {fact("owner", t("owner"), order.ownerName)}
          {fact("department", t("department"), order.departmentName ?? t("details.notSet"))}
          {fact(
            "plannedTotal",
            t("plannedTotal"),
            order.plannedTotal === null ? (
              t("details.notSet")
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold tabular-nums">
                  {format.money(order.plannedTotal)}
                </span>
                {hint ? (
                  <span className="text-[13px] font-semibold text-warning">{hint}</span>
                ) : null}
              </span>
            ),
          )}
          {fact(
            "actualTotal",
            t("actualTotal"),
            order.actualTotal === null || order.received === "0" ? (
              <span className="text-muted-foreground">{t("notBought")}</span>
            ) : (
              <span className="tabular-nums">{format.money(order.actualTotal)}</span>
            ),
          )}
        </dl>
      </header>

      <OrderStepper steps={order.steps} />

      {order.changes && order.changes.list.length > 0 ? (
        <WhatChanged
          since={order.changes.since}
          changes={order.changes.list}
          unit={order.unitShortName}
        />
      ) : null}

      <section className="flex flex-col gap-4">
        <nav
          aria-label={t("tabs.label")}
          className="flex gap-1 rounded-xl bg-muted p-1 sm:self-start"
        >
          {tabLink("details")}
          {hasPurchases ? tabLink("purchases") : null}
          {tabLink("history")}
        </nav>
        <div className="rounded-xl bg-card p-4 sm:p-6">
          <h2 className="sr-only">{t(`${tab}.title`)}</h2>
          {tab === "details" ? (
            details
          ) : tab === "purchases" ? (
            <PurchasesTab order={order} />
          ) : (
            <OrderHistory events={order.events} />
          )}
        </div>
      </section>

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
                },
                total: format.money(order.plannedTotal),
              }
            : null
        }
        moves={[...PAGE_MOVES.filter((move) => order.actions.includes(move)), ...order.buying]}
        number={order.number}
        // Copy as new of a numbered order; a draft is edited in the drafts grid (decided item 11).
        canCopy={order.canCopy && order.status !== "DRAFT" && order.number !== null}
        recordPurchase={order.canRecordPurchase ? `/orders/${order.id}/purchase` : null}
        waitingLine={line}
      />
    </div>
  );
}
