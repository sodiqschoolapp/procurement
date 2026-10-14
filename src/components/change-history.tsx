import {
  type MessageKeys,
  type Messages,
  type NamespaceKeys,
  type NestedKeyOf,
  useTranslations,
} from "next-intl";

import { type AuditJson, type AuditObject, changedFields } from "@/domain/audit";
import type { Formatters } from "@/i18n/format";
import { useFormatters } from "@/i18n/use-formatters";

// The change history of one record (04-catalogs.md rule 9: "who changed what and when";
// build-plan 0.9). It shows the rows of listChangeHistory() and the fields changedFields()
// returns; it calculates nothing. Every value goes through the shared formatters by the kind
// its caller names, so no raw code, JSON or ISO text reaches the screen (11-screens-and-ux.md
// rules 10 and 14). Shown first on the settings page of task 1.1.

type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;
type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/**
 * How a field's value is shown; `enum` reads `<namespace>.<value>` from the message files.
 * `percent`, `percentOrOff` (a percent or the stored `"off"`), `hours` and `monthDay` (a
 * `{month, day}` object) are the settings' kinds (plan of 1.1, review Must fix 3).
 */
export type HistoryValueKind =
  | "text"
  | "money"
  | "quantity"
  | "date"
  | "moment"
  | "boolean"
  | "percent"
  | "percentOrOff"
  | "hours"
  | "monthDay"
  | { enum: Namespace };

/** One entry per field of the record: its label and the kind of its value. */
export type HistoryField = { label: MessageKey; kind: HistoryValueKind };

export type ChangeHistoryEntry = {
  id: string;
  action: string;
  actorName: string;
  before: AuditObject | null;
  after: AuditObject | null;
  createdAt: Date;
};

type Translate = ReturnType<typeof useTranslations<never>>;

/** A key that may be missing: its text, or the fallback's. */
function textOr(t: Translate, key: string, fallback: MessageKey): string {
  return t.has(key as MessageKey) ? t(key as MessageKey) : t(fallback);
}

const MONEY = /^-?\d+$/;

const isWholeNumber = (value: AuditJson): value is number =>
  typeof value === "number" && Number.isInteger(value);

/** A `{month, day}` object of whole numbers, month 1 to 12; anything else is not one. */
function monthDayOf(value: AuditJson): { month: number; day: number } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { month, day } = value;
  if (month === undefined || day === undefined || !isWholeNumber(month) || !isWholeNumber(day)) {
    return null;
  }
  return month >= 1 && month <= 12 ? { month, day } : null;
}

function shown(value: AuditJson | null, kind: HistoryValueKind, t: Translate, f: Formatters) {
  if (value === null) return t("audit.noValue");
  try {
    if (kind === "boolean" && typeof value === "boolean")
      return t(value ? "audit.yes" : "audit.no");
    if (kind === "money" && typeof value === "string" && MONEY.test(value)) {
      return f.money(BigInt(value));
    }
    if (kind === "quantity" && typeof value === "string") return f.quantity(value);
    if (kind === "date" && typeof value === "string") return f.date(value);
    if (kind === "moment" && typeof value === "string") {
      const moment = new Date(value);
      return `${f.date(moment)} ${f.time(moment)}`;
    }
    if ((kind === "percent" || kind === "percentOrOff") && isWholeNumber(value)) {
      return t("audit.percent", { value });
    }
    // The guard's stored word is never shown raw: its label (CLAUDE.md rule 13).
    if (kind === "percentOrOff" && value === "off") return t("audit.off");
    if (kind === "hours" && isWholeNumber(value)) return t("audit.hours", { value });
    if (kind === "monthDay") {
      const monthDay = monthDayOf(value);
      if (monthDay) return t(`audit.monthDay.${monthDay.month}` as MessageKey, { day: monthDay.day });
    }
    if (typeof kind === "object" && typeof value === "string") {
      return textOr(t, `${kind.enum}.${value}`, "audit.unknownValue");
    }
    // An object or array is never shown as its JSON (review of 0.9).
    if (kind === "text" && (typeof value === "string" || typeof value === "number")) {
      return String(value);
    }
  } catch {
    // A value the formatter refuses is shown as unknown, never as its raw text.
  }
  return t("audit.unknownValue");
}

export function ChangeHistory({
  entries,
  fields,
}: {
  entries: readonly ChangeHistoryEntry[];
  fields: Readonly<Record<string, HistoryField>>;
}) {
  const t = useTranslations();
  const f = useFormatters();

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("audit.empty")}</p>;
  }

  return (
    <ol className="flex flex-col gap-3 md:gap-0 md:divide-y md:rounded-lg md:border">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-2 rounded-lg border p-3 md:grid md:grid-cols-[10rem_12rem_1fr] md:gap-4 md:rounded-none md:border-0"
        >
          <div className="flex flex-wrap gap-x-2 text-sm md:contents">
            <time dateTime={entry.createdAt.toISOString()} className="tabular-nums">
              {f.date(entry.createdAt)} {f.time(entry.createdAt)}
            </time>
            <span className="font-medium">{entry.actorName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {textOr(t, `audit.actions.${entry.action}`, "audit.changed")}
            </p>
            <dl className="flex flex-col gap-1 text-sm">
              {changedFields(entry.before, entry.after).map((change) => {
                const field = fields[change.field];
                const kind = field?.kind ?? "text";
                return (
                  <div key={change.field} className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">
                      {t(field?.label ?? "audit.otherField")}
                    </dt>
                    <dd className="flex flex-wrap gap-x-2">
                      {change.before !== null && (
                        <del className="text-muted-foreground">
                          <span className="sr-only">{t("audit.before")} </span>
                          {shown(change.before, kind, t, f)}
                        </del>
                      )}
                      <ins className="no-underline">
                        <span className="sr-only">{t("audit.after")} </span>
                        {shown(change.after, kind, t, f)}
                      </ins>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </li>
      ))}
    </ol>
  );
}
