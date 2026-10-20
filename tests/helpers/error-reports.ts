import { onTestFinished, vi } from "vitest";

// The error reports of 9.3 caught in a test: ERROR_REPORT_DSN is set to an invented address and
// `fetch` is stubbed, so the real client of src/server/error-report.ts builds and "sends" each
// event. Undone when the test ends. The send starts synchronously, so a caller that does not
// await it (`void reportError(…)`) has already called `fetch` when it returns.

export const INVENTED_DSN = "https://inventedkey@errors.invalid/42";

export type CaughtReport = { url: string; headers: Record<string, string>; body: string };

/** Starts catching; the returned list fills as reports are sent. */
export function catchErrorReports(
  answer: () => Promise<Response> = async () => new Response("{}", { status: 200 }),
): CaughtReport[] {
  const caught: CaughtReport[] = [];
  vi.stubEnv("ERROR_REPORT_DSN", INVENTED_DSN);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      caught.push({
        url,
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      });
      return answer();
    }),
  );
  onTestFinished(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  return caught;
}

type SentEvent = {
  release: string;
  environment: string;
  level: string;
  timestamp: number;
  transaction: string;
  tags: Record<string, string>;
  exception: {
    values: { type: string; value: string; stacktrace: { frames: { filename: string }[] } }[];
  };
};

/** The event of one caught report (the third line of the envelope). */
export function eventOf(report: CaughtReport): SentEvent {
  const lines = report.body.trimEnd().split("\n");
  return JSON.parse(lines[2]!) as SentEvent;
}
