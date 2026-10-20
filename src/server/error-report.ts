import { randomUUID } from "node:crypto";

import { now } from "./clock";
import { currentCommit } from "./commit";
import { describeForLog } from "./log-error";

// The error-reporting client of 9.3 (18-hosting-and-costs.md row 8: "Error and uptime alerts,
// for example Sentry"). No SDK (plan decision 2, Look first): one event in Sentry's documented
// envelope format, sent with fetch. Off until the owner types ERROR_REPORT_DSN (plan decision 3).
//
// What an event holds (plan decision 5; review correction 1; CLAUDE.md conventions: no personal
// data in a log): the error's name, the text of describeForLog(), the stack frames built from the
// `at …` lines only, where it happened, the commit and the environment. Never the stack's first
// line (it repeats the message, which for Drizzle holds every bound value), never `cause`, never
// a header, cookie, body, query string or user.

/** How long a send may take before it is given up (plan, What will exist). */
export const REPORT_WAIT_MS = 2_000;

type Destination = { envelopeUrl: string; publicKey: string };

/** The envelope address and key of a DSN `https://<key>@<host>[/<prefix>]/<project>`, or null. */
export function destinationOf(dsn: string): Destination | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const project = parts.pop();
  if (!url.username || !project || !/^\d+$/.test(project)) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const prefix = parts.length > 0 ? `/${parts.join("/")}` : "";
  return {
    envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`,
    publicKey: decodeURIComponent(url.username),
  };
}

type Frame = { function?: string; filename: string; lineno: number; colno: number };

/** The frames of a V8 stack, oldest first as Sentry reads them; only its `at …` lines. */
export function framesOf(error: unknown): Frame[] {
  if (!(error instanceof Error) || typeof error.stack !== "string") return [];
  const frames: Frame[] = [];
  for (const line of error.stack.split("\n")) {
    const match = /^\s+at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) continue;
    const [, name, filename, lineno, colno] = match;
    frames.push({
      ...(name ? { function: name } : {}),
      filename: filename!,
      lineno: Number(lineno),
      colno: Number(colno),
    });
  }
  return frames.reverse();
}

/** `trial` while the demo data is on (D52, 9.4 keeps that name), otherwise `production`. */
export function environmentName(): "trial" | "production" {
  return process.env.SEED_DEMO_DATA?.trim() ? "trial" : "production";
}

/** The envelope body of one error event: three JSON lines. */
export function envelopeOf(
  error: unknown,
  where: string,
  tags: Record<string, string>,
  dsn: string,
): string {
  const at = now();
  const eventId = randomUUID().replaceAll("-", "");
  const event = {
    event_id: eventId,
    timestamp: at.getTime() / 1000,
    platform: "node",
    level: "error",
    release: currentCommit(),
    environment: environmentName(),
    transaction: where,
    tags: { where, ...tags },
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : typeof error,
          value: describeForLog(error),
          stacktrace: { frames: framesOf(error) },
        },
      ],
    },
  };
  const header = { event_id: eventId, sent_at: at.toISOString(), dsn };
  return [header, { type: "event" }, event].map((line) => JSON.stringify(line)).join("\n") + "\n";
}

/**
 * Sends one error to the reporting service named by ERROR_REPORT_DSN; does nothing without it.
 * Never throws and never waits longer than REPORT_WAIT_MS, so a broken service changes no
 * answer. Callers that must not wait call it with `void` (plan decision 6).
 * @param where what was running: `action <name>`, `job <name>`, `render /orders/[id]`
 * @param tags more short labels, such as the route type; never a value a user typed
 */
export async function reportError(
  error: unknown,
  where: string,
  tags: Record<string, string> = {},
): Promise<void> {
  const dsn = process.env.ERROR_REPORT_DSN?.trim();
  if (!dsn) return;
  const destination = destinationOf(dsn);
  if (!destination) {
    // The DSN itself is not printed: it is a value the owner typed encrypted.
    console.error(
      "Error report not sent: ERROR_REPORT_DSN is not a valid DSN (docs/monitoring.md).",
    );
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_WAIT_MS);
  try {
    const response = await fetch(destination.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${destination.publicKey}, sentry_client=procurement/1`,
      },
      body: envelopeOf(error, where, tags, dsn),
      signal: controller.signal,
    });
    if (!response.ok) console.error(`Error report not accepted: HTTP ${response.status}.`);
  } catch (sendError) {
    console.error(
      `Error report not sent: ${sendError instanceof Error ? sendError.name : "unknown"}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
