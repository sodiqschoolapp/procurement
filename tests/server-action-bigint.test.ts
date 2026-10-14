import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

// Money is whole so'm in `bigint` (CLAUDE.md rule 6; developer-rules.md rule 6), and an action
// returns it to the browser inside its ActionResult (plan of 0.8, "Not checked"). This sends a
// result through the serialisation of Server Actions that Next.js ships (React's Flight
// protocol, the copy under next/dist/compiled) and reads it back as the browser does. The server
// half needs the `react-server` condition, so each half runs in its own Node process.

const SERVER = `
import { createRequire } from "node:module";
import { Writable } from "node:stream";
const require = createRequire(process.cwd() + "/package.json");
const server = require("next/dist/compiled/react-server-dom-webpack/server.node");
const chunks = [];
const stream = server.renderToPipeableStream(
  { ok: true, data: { amount: 1250000n, beyondDouble: 9007199254740993n, negative: -15n } }, {});
await new Promise((done) => stream.pipe(new Writable({
  write(chunk, encoding, next) { chunks.push(chunk); next(); },
  final(next) { done(); next(); },
})));
process.stdout.write(Buffer.concat(chunks));
`;

const CLIENT = `
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
const require = createRequire(process.cwd() + "/package.json");
const client = require("next/dist/compiled/react-server-dom-webpack/client.node");
const value = await client.createFromNodeStream(Readable.from([readFileSync(0)]), {
  moduleMap: {}, serverModuleMap: null, moduleLoading: null });
const { amount, beyondDouble, negative } = value.data;
process.stdout.write(JSON.stringify({
  types: [typeof amount, typeof beyondDouble, typeof negative],
  exact: amount === 1250000n && beyondDouble === 9007199254740993n && negative === -15n,
}));
`;

function node(script: string, conditions: string[], input?: Buffer): Buffer {
  return execFileSync(
    process.execPath,
    [...conditions.flatMap((c) => ["--conditions", c]), "--input-type=module", "-e", script],
    { input, env: { ...process.env, NODE_ENV: "production" } },
  );
}

describe("bigint in an ActionResult (CLAUDE.md rule 6)", () => {
  it("reaches the browser as the same bigint, also beyond 2^53", () => {
    const wire = node(SERVER, ["react-server"]);
    const read = JSON.parse(node(CLIENT, [], wire).toString());
    expect(read).toEqual({ types: ["bigint", "bigint", "bigint"], exact: true });
  }, 30_000);
});
