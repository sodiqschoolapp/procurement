import { afterEach } from "vitest";

import { resetClock } from "./clock";

// Runs before each `unit` test file. A clock fixed by one test never leaks into the next.
afterEach(() => {
  resetClock();
});
