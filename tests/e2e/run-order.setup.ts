import { test as setup } from "@playwright/test";

import { withDatabase } from "./acceptance-fixtures";

// The start of every browser run (playwright.config.ts, project `start`): its teardown is S21,
// which switches the school's Finance step and so runs only after every other test of the run
// (plan of 4.10c). It checks only that the e2e database answers.

setup("the e2e database answers", async () => {
  await withDatabase((client) => client.query("select 1"));
});
