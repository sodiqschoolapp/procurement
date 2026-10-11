import { afterEach, describe, expect, it, vi } from "vitest";

// No spec rule covers this. The test guards build-plan 0.2 ("the database client") and the
// CLAUDE.md convention "Secrets live in provider dashboards and the local `.env` only":
// an error must never carry an address.

describe("the database client without DATABASE_URL (build-plan 0.2; CLAUDE.md, secrets convention)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // The import below loads the driver and Drizzle from disk inside the test. That takes 2.7 s
  // on a warm machine, too close to Vitest's 5 s for a cold one (a run right after `npm ci`).
  it(
    "fails at import with an error that names the variable and holds no address",
    {
      timeout: 30_000,
    },
    async () => {
      vi.stubEnv("DATABASE_URL", "");
      vi.resetModules();

      const failure = await import("@/server/db/client").then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(Error);
      const message = (failure as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toMatch(/postgres(ql)?:\/\//);
    },
  );
});
