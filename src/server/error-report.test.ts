import { afterEach, describe, expect, it, vi } from "vitest";

import { INVENTED_DSN, catchErrorReports, eventOf } from "../../tests/helpers/error-reports";
import { setClock } from "../../tests/helpers/clock";
import { REPORT_WAIT_MS, destinationOf, framesOf, reportError } from "./error-report";

// The error-reporting client of build-plan 9.3 (18-hosting-and-costs.md row 8). What an event may
// hold: plan of 9.3, decision 5, and the review of the plan, correction 1 (CLAUDE.md conventions:
// no personal data in a log; plan of 0.8, decision 7). Time from the injected clock (developer-rules
// rule 10). Names, phones and values are invented.

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the DSN (plan of 9.3, What will exist)", () => {
  it("gives the envelope address and the key", () => {
    expect(destinationOf("https://abc123@o1.ingest.sentry.invalid/4501")).toEqual({
      envelopeUrl: "https://o1.ingest.sentry.invalid/api/4501/envelope/",
      publicKey: "abc123",
    });
    expect(destinationOf("http://k@127.0.0.1:9000/prefix/7")?.envelopeUrl).toBe(
      "http://127.0.0.1:9000/prefix/api/7/envelope/",
    );
  });

  it.each(["not a url", "https://o1.invalid/4501", "https://k@o1.invalid/", "ftp://k@h/1"])(
    "refuses %s",
    (dsn) => {
      expect(destinationOf(dsn)).toBeNull();
    },
  );
});

describe("reportError (plan of 9.3, decisions 3, 5, 6, 8)", () => {
  it("does nothing without ERROR_REPORT_DSN", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    vi.stubEnv("ERROR_REPORT_DSN", "");
    await reportError(new Error("invented"), "action sample");
    expect(fetched).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends one event with name, safe message, frames, where, commit, environment and the clock's time", async () => {
    const reports = catchErrorReports();
    vi.stubEnv("GIT_COMMIT", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("SEED_DEMO_DATA", "yes");
    setClock("2031-01-02T03:04:05Z");

    await reportError(new TypeError("invented failure"), "action createSample", {
      routeType: "action",
    });

    expect(reports).toHaveLength(1);
    const [report] = reports;
    expect(report!.url).toBe("https://errors.invalid/api/42/envelope/");
    expect(report!.headers["X-Sentry-Auth"]).toContain("sentry_key=inventedkey");
    const header = JSON.parse(report!.body.split("\n")[0]!) as { sent_at: string; dsn: string };
    expect(header.sent_at).toBe("2031-01-02T03:04:05.000Z");
    expect(header.dsn).toBe(INVENTED_DSN);
    const event = eventOf(report!);
    expect(event).toMatchObject({
      level: "error",
      release: "0123456789abcdef0123456789abcdef01234567",
      environment: "trial",
      timestamp: Date.UTC(2031, 0, 2, 3, 4, 5) / 1000,
      transaction: "action createSample",
      tags: { where: "action createSample", routeType: "action" },
    });
    expect(event.exception.values[0]).toMatchObject({
      type: "TypeError",
      value: "TypeError: invented failure",
    });
    expect(event.exception.values[0]!.stacktrace.frames.length).toBeGreaterThan(0);
  });

  it("names the environment production without SEED_DEMO_DATA (D52)", async () => {
    const reports = catchErrorReports();
    vi.stubEnv("SEED_DEMO_DATA", "");
    await reportError(new Error("invented"), "job sample");
    expect(eventOf(reports[0]!).environment).toBe("production");
  });

  it("correction 1: a Drizzle-shaped error sends no bound value, no cause and no stack message", async () => {
    const reports = catchErrorReports();
    const cause = Object.assign(new Error("duplicate key value: Invented Person"), {
      code: "23505",
      constraint: "users_username_key",
      detail: "Key (phone)=(+998900000000) already exists, Invented Person.",
    });
    const error = new Error(
      'Failed query: insert into "users" values ($1, $2)\nparams: Invented Person,+998900000000',
      { cause },
    );

    await reportError(error, "action createUser");

    const body = reports[0]!.body;
    for (const value of ["Invented Person", "+998900000000", "params", "Failed query", "detail"]) {
      expect(body).not.toContain(value);
    }
    expect(eventOf(reports[0]!).exception.values[0]!.value).toBe(
      "Error: PostgreSQL 23505 constraint users_username_key",
    );
  });

  it("frames come from the `at` lines only, oldest first", () => {
    const error = new Error("Invented secret line");
    error.stack = [
      "Error: Invented secret line",
      "    at inner (/app/src/server/a.ts:10:5)",
      "    at async outer (/app/src/server/b.ts:20:7)",
      "    at /app/src/server/c.ts:30:9",
      "Invented secret continuation",
    ].join("\n");
    expect(framesOf(error)).toEqual([
      { filename: "/app/src/server/c.ts", lineno: 30, colno: 9 },
      { function: "async outer", filename: "/app/src/server/b.ts", lineno: 20, colno: 7 },
      { function: "inner", filename: "/app/src/server/a.ts", lineno: 10, colno: 5 },
    ]);
    expect(framesOf("not an error")).toEqual([]);
  });

  it("a fetch that throws is swallowed with one log line (decision 6: never an unhandled rejection)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    catchErrorReports(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(reportError(new Error("invented"), "job sample")).resolves.toBeUndefined();
    expect(logged.mock.calls).toEqual([["Error report not sent: TypeError."]]);
  });

  it("an answer that is not 2xx is logged by its status only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    catchErrorReports(async () => new Response("quota", { status: 429 }));
    await reportError(new Error("invented"), "job sample");
    expect(logged.mock.calls).toEqual([["Error report not accepted: HTTP 429."]]);
  });

  it(`a send that hangs is given up after ${REPORT_WAIT_MS} ms`, async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ERROR_REPORT_DSN", INVENTED_DSN);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const sent = reportError(new Error("invented"), "job sample");
    await vi.advanceTimersByTimeAsync(REPORT_WAIT_MS);
    await expect(sent).resolves.toBeUndefined();
    expect(logged.mock.calls).toEqual([["Error report not sent: AbortError."]]);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("a malformed DSN sends nothing and is logged without the DSN", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    vi.stubEnv("ERROR_REPORT_DSN", "https://invented-host-without-key/1");
    await reportError(new Error("invented"), "job sample");
    expect(fetched).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0])).not.toContain("invented-host-without-key");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
