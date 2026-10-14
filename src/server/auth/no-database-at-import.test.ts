import { describe, expect, it } from "vitest";

// `next build` runs with no DATABASE_URL (Dockerfile; build-plan 0.16). The layout reads the
// session for the language and the start page imports the sign-out action, so these modules
// must load without a database address; the client is loaded when a query runs (CI e2e run of
// 9ca10bf, "DATABASE_URL is not set" during `npm run build`). The unit project has an empty
// DATABASE_URL, so importing the client here would throw.
describe("the sign-in modules load without a database address (build-plan 0.16)", () => {
  it.each(["./session", "./sign-in", "../../i18n/request", "../../app/login/actions"])(
    "imports %s",
    async (path) => {
      await expect(import(path)).resolves.toBeDefined();
    },
  );
});
