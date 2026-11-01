// What the Help page must cover, read from the code and the spec (11-screens-and-ux.md, Help page
// rule 2; build-plan 9.7, Build 5; plan of 9.7, decided items 2 and 12). Only the coverage test
// reads this file: it reads files with node:fs, so no page imports it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { REQUEST_STATUSES } from "@/domain/request-status";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  DIRECT_ENTRY_REASONS,
  WRITE_OFF_REASONS,
} from "@/domain/stock-documents";
import { MONEY_ROW_KINDS } from "@/domain/money-ledger";
import { MOVEMENT_TYPES } from "@/domain/stock";
import { NOTIFICATION_TYPES } from "@/domain/notifications";
import { ORDER_EVENT_TYPES, ORDER_MOVES } from "@/domain/order-moves";
import { ORDER_FIELDS } from "@/domain/order-fields";
import { ORDER_PROGRESS } from "@/domain/purchases";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import { MANAGER_RIGHTS, PERMISSIONS, ROLES } from "@/domain/permissions";
import { SETTING_KEYS } from "@/domain/settings";

import type { HelpChapter } from "./outline";

/** The edge-case files whose situations are the common questions (plan of 9.7, decided item 12). */
export const SITUATION_FILES = [
  "requests-and-approval",
  "purchasing-and-money",
  "warehouse",
  "system",
] as const;

const ROOT = process.cwd();

/** Every page of the app as its folder under src/app names it, route groups left out. */
export function appScreens(folder = join(ROOT, "src", "app")): string[] {
  const found: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === "page.tsx") {
        const route = relative(folder, at)
          .split(sep)
          .filter((part) => part !== "" && !/^\(.*\)$/u.test(part))
          .join("/");
        found.push(`/${route}`);
      }
    }
  };
  walk(folder);
  // The "Not found" page of unknown addresses is no screen of its own.
  return found.filter((route) => route !== "/[...missing]").sort();
}

/** The number of situation rows of one edge-case file (its table, header and rule left out). */
export function situationCount(file: string): number {
  const text = readFileSync(join(ROOT, "docs", "spec", "edge-cases", `${file}.md`), "utf8");
  return text
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .filter((line) => !line.startsWith("| Situation |") && !/^\|\s*-{3}/u.test(line)).length;
}

/** Every item the Help page must cover, as the outline's `covers` names them. */
export function requiredItems(): string[] {
  const each = (kind: string, items: readonly string[]) => items.map((item) => `${kind}:${item}`);
  return [
    ...each("status", REQUEST_STATUSES),
    ...ORDER_MOVES.map((move) => `move:${move.from}:${move.action}`),
    ...each("event", ORDER_EVENT_TYPES),
    ...each("permission", Object.keys(PERMISSIONS)),
    ...each("right", MANAGER_RIGHTS),
    ...each("setting", SETTING_KEYS),
    ...each("orderField", ORDER_FIELDS),
    ...each("notification", NOTIFICATION_TYPES),
    ...each("document", DOCUMENT_TYPES),
    ...each("documentStatus", DOCUMENT_STATUSES),
    ...each("movement", MOVEMENT_TYPES),
    ...each("moneyRow", MONEY_ROW_KINDS),
    ...each("payment", PAYMENT_TYPES),
    ...each("progress", ORDER_PROGRESS),
    ...each("writeOff", WRITE_OFF_REASONS),
    ...each("entryReason", DIRECT_ENTRY_REASONS),
    ...each("role", ROLES),
    ...each("screen", appScreens()),
    ...SITUATION_FILES.flatMap((file) =>
      Array.from({ length: situationCount(file) }, (_, at) => `situation:${file}:${at + 1}`),
    ),
  ];
}

/** For each item the outline names, the topics that cover it. */
export function coveredBy(outline: readonly HelpChapter[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const chapter of outline) {
    for (const topic of chapter.topics) {
      for (const item of topic.covers ?? []) {
        found.set(item, [...(found.get(item) ?? []), topic.id]);
      }
    }
  }
  return found;
}

/** The required items no topic covers. */
export function uncovered(outline: readonly HelpChapter[]): string[] {
  const covered = coveredBy(outline);
  return requiredItems().filter((item) => !covered.has(item));
}

/** The items the outline names that the code does not have (a typo, or a feature gone). */
export function unknownItems(outline: readonly HelpChapter[]): string[] {
  const required = new Set(requiredItems());
  return [...coveredBy(outline).keys()].filter((item) => !required.has(item));
}

type Messages = Record<string, unknown>;

function at(messages: Messages, path: string): string | undefined {
  let value: unknown = messages;
  for (const part of path.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "string" ? value : undefined;
}

/** A label as the screen shows it, its `({count})`-style arguments left out. */
function bare(label: string | undefined): string | undefined {
  return label
    ?.replace(/\s*\(\{[^}]*\}\)/gu, "")
    .replace(/\{[^}]*\}/gu, "")
    .trim();
}

const SETTING_LABELS: Record<string, string> = {
  school_name: "settings.schoolName",
  school_year_start: "settings.schoolYearStart",
  default_payment_type: "settings.defaultPaymentType",
  price_hint_percent: "settings.priceHintPercent",
  overspend_guard_percent: "settings.overspendGuardPercent",
  overspend_guard_min_amount: "settings.overspendGuardMinAmount",
  receipt_required_for_cash: "settings.receiptRequiredForCash",
  reminder_hours: "settings.reminderHours",
  escalation_hours: "settings.escalationHours",
  principal_step: "settings.principalStep.title",
  finance_step: "settings.financeStep.title",
  order_fields: "settings.orderFields.title",
};

function actionLabel(messages: Messages, action: string): string | undefined {
  if (action === "SUBMIT") return bare(at(messages, "orders.submit.button"));
  if (action === "APPROVE") return bare(at(messages, "orders.approve.button"));
  return bare(at(messages, `orders.moves.button.${action}`));
}

/**
 * The on-screen labels the covering topic's words must hold (plan of 9.7, decided item 2), from
 * the English message file; none for an item with no label of its own (a permission key, a
 * notification, a page, a situation, a History line without a button).
 */
export function labelsOf(item: string, messages: Messages): string[] {
  const [kind, key, second] = item.split(":") as [string, string, string | undefined];
  const one = (path: string) => {
    const label = bare(at(messages, path));
    return label ? [label] : [];
  };
  switch (kind) {
    case "status":
      return one(`requestStatus.${key}`);
    case "move": {
      const labels = [...one(`requestStatus.${key}`)];
      const button = actionLabel(messages, second!);
      if (button) labels.push(button);
      return labels;
    }
    case "event": {
      const button = actionLabel(messages, key);
      return button ? [button] : [];
    }
    case "right":
      return one(`managerRights.names.${key}`);
    case "setting":
      return one(SETTING_LABELS[key] ?? "");
    case "orderField":
      return one(`settings.orderFields.field.${key}`);
    case "document":
      return one(`warehouse.documents.types.${key}`);
    case "documentStatus":
      return one(`warehouse.documents.status.${key}`);
    case "movement":
      return one(`warehouse.item.types.${key}`);
    case "moneyRow":
      return one(`money.kinds.${key}`);
    case "payment":
      return one(`paymentTypes.${key}`);
    case "progress":
      return one(`orders.progress.${key}`);
    case "writeOff":
      return one(`warehouse.writeOff.reasons.${key}`);
    case "entryReason":
      return one(`warehouse.directEntry.reasons.${key}`);
    case "role":
      return one(`roles.${key}`);
    default:
      return [];
  }
}
