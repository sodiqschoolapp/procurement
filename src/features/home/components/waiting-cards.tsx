"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import type { WireOrderGroup } from "@/features/orders/list-wire";
import { ApproveButton } from "@/features/orders/components/approve-button";
import { MoveButton } from "@/features/orders/components/move-button";
import { useFormatters } from "@/i18n/use-formatters";

import type { CardMove } from "../queries/principal-home";

// The Principal's waiting group rows as large cards (11-screens-and-ux.md, Interface per role:
// Principal, "Home shows waiting group rows as large cards with total, urgent label and price
// hints. Ticking all and approving, sending back or rejecting takes two taps on a phone"; 05
// Group rows 1 to 3; plan of 6.1, decided item 4). A card's buttons are the tick-all of its group
// row: each acts on every order in it, all or nothing (06 rule 8), with the version the page
// showed (06 rule 7). Tap one is the button, tap two the confirmation (11 rule 6); Send back and
// Reject take their reason between the two (06 rule 3). The buttons are the moves the server's
// state machine allows on all of the card's orders; a card over 200 orders has none and points to
// the list. After an answer the page is refreshed; a refusal names its orders on the card.

export type WaitingCardData = { group: WireOrderGroup; moves: CardMove[] };

type Failed = { title: string; lines: { orderId: string; line: string }[] } | null;

export function WaitingCards({
  cards,
  listHref,
  financeStep = true,
}: {
  cards: WaitingCardData[];
  listHref: string;
  /** The setting `finance_step` the server read (plan of 4.10c). */
  financeStep?: boolean;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {cards.map((card) => (
        <WaitingCard
          key={card.group.key}
          card={card}
          listHref={listHref}
          financeStep={financeStep}
        />
      ))}
    </ul>
  );
}

function WaitingCard({
  card,
  listHref,
  financeStep,
}: {
  card: WaitingCardData;
  listHref: string;
  financeStep: boolean;
}) {
  const t = useTranslations("home.principal.card");
  const tHome = useTranslations("home");
  const tList = useTranslations("orders.list");
  const tOrders = useTranslations("orders");
  const tPayment = useTranslations("paymentTypes");
  const tCommon = useTranslations("common");
  const format = useFormatters();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<Failed>(null);
  const { group, moves } = card;
  const versions = new Map(group.orders.map((order) => [order.id, order.version]));
  const versionOf = (id: string) => versions.get(id) ?? 0;
  const product = group.subtypeName
    ? `${group.productName}, ${group.subtypeName}`
    : group.productName;
  const ordersId = `card-${group.key.replaceAll(":", "-")}`;
  const approveOrders = group.orders.map((order) => ({
    id: order.id,
    number: order.number,
    status: group.status,
    paymentType: order.paymentType,
    plannedTotal: order.plannedTotal,
    owner: { id: order.ownerId, name: order.ownerName },
  }));

  return (
    <li
      data-waiting-card={group.key}
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-subheading font-semibold break-words">
            {product}{" "}
            <span className="text-small font-normal text-muted-foreground">{group.branchCode}</span>
          </h3>
          <span
            data-card-total
            className="text-heading font-semibold whitespace-nowrap tabular-nums"
          >
            {format.money(BigInt(group.summary.totals.grand))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {format.quantity(group.summary.quantity)} {group.unitShortName}
          </span>
          <span>{tHome("orders", { count: group.summary.count })}</span>
          {/* No order of the group has a needed-by date: nothing to show (05 Fields the Head sets 3). */}
          {group.summary.earliestNeededBy !== null && (
            <span className="tabular-nums">
              {t("neededBy", { date: format.date(group.summary.earliestNeededBy) })}
            </span>
          )}
          {group.summary.urgent && (
            <span className="inline-flex items-center gap-1 font-semibold text-destructive">
              <Icon name="warning" size={16} />
              {tList("urgent")}
            </span>
          )}
          {group.summary.overdue && (
            <span className="inline-flex items-center gap-1 font-semibold text-warning">
              <Icon name="schedule" size={16} />
              {tOrders("overdue")}
            </span>
          )}
          {group.summary.priceHint !== null && (
            <span data-price-hint className="font-semibold text-warning">
              {tOrders("priceHint", {
                percent: BigInt(group.summary.priceHint) as unknown as number,
              })}
            </span>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        icon={open ? "expand_more" : "chevron_right"}
        aria-expanded={open}
        aria-controls={ordersId}
        onClick={() => setOpen((shown) => !shown)}
        className="h-auto min-h-11 self-start text-left whitespace-normal sm:min-h-10"
      >
        {open ? t("hideOrders", { product }) : t("showOrders", { product })}
      </Button>
      {open && (
        <ul id={ordersId} className="flex flex-col gap-2 text-small">
          {group.orders.map((order) => (
            <li
              key={order.id}
              data-order={order.id}
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 sm:grid-cols-4"
            >
              <Link
                href={`/orders/${order.id}`}
                className="inline-flex min-h-11 min-w-11 items-center font-semibold underline-offset-2 hover:underline sm:min-h-0"
              >
                {order.number}
              </Link>
              <span>{order.departmentName}</span>
              <span className="tabular-nums">
                {format.quantity(order.quantity)} {group.unitShortName}
              </span>
              <span className="tabular-nums">{format.money(BigInt(order.price))}</span>
              <span>{tPayment(order.paymentType)}</span>
              {order.neededBy !== null && (
                <span className="tabular-nums">{format.date(order.neededBy)}</span>
              )}
              <span>{order.ownerName}</span>
              <span className="tabular-nums">
                {format.date(order.submittedAt)} {format.time(order.submittedAt)}
              </span>
              {order.priority === "URGENT" && (
                <span className="text-destructive">{tList("urgent")}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {failed && (
        <section
          role="alert"
          data-card-failed
          className="flex flex-col gap-2 rounded-lg border border-destructive p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-sm font-semibold text-destructive">{failed.title}</h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFailed(null)}>
              {tCommon("close")}
            </Button>
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {failed.lines.map(({ orderId, line }) => (
              <li key={orderId}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {moves.length > 0 ? (
        <div data-card-actions className="flex flex-wrap gap-3 max-sm:[&>*]:flex-1">
          {moves.includes("APPROVE") && (
            <ApproveButton
              orders={approveOrders}
              versionOf={versionOf}
              total={format.money(BigInt(group.summary.totals.grand))}
              financeStep={financeStep}
              onAnswer={setFailed}
            />
          )}
          {(["SEND_BACK", "REJECT"] as const)
            .filter((move) => moves.includes(move))
            .map((move) => (
              <MoveButton
                key={move}
                move={move}
                orders={approveOrders}
                versionOf={versionOf}
                onAnswer={setFailed}
              />
            ))}
        </div>
      ) : (
        group.orders.length > ORDER_ACTION_MAX && (
          <Link
            href={listHref}
            className="text-sm font-semibold underline-offset-2 hover:underline"
          >
            {t("tooMany")}
          </Link>
        )
      )}
    </li>
  );
}
