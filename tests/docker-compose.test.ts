import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// No spec rule covers this. The test guards the review of the plan of 0.2, answer 4: the local
// PostgreSQL has no password, so the only wall around it is that its port answers on this
// machine alone ("never publish it wider"); and CLAUDE.md, what matters most 2.

// The entries of every `ports:` list of the file, without their quotes.
function publishedPorts(composeFile: string): string[] {
  const ports: string[] = [];
  let listIndent: number | undefined;

  for (const line of composeFile.split(/\r?\n/)) {
    const text = line.trim();
    if (text === "" || text.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;

    if (text === "ports:") {
      listIndent = indent;
    } else if (listIndent !== undefined && indent > listIndent && text.startsWith("- ")) {
      ports.push(
        text
          .slice(2)
          .trim()
          .replace(/^["']|["']$/g, ""),
      );
    } else {
      listIndent = undefined;
    }
  }
  return ports;
}

describe("docker-compose.yml publishes ports on this machine only (plan review 0.2, answer 4; CLAUDE.md, what matters most 2)", () => {
  it("finds the entries of a ports list, and only those", () => {
    const sample = [
      "services:",
      "  one:",
      "    ports:",
      "      # a comment between",
      '      - "127.0.0.1:1111:1111"',
      "      - 2222:2222",
      "    volumes:",
      "      - data:/var/lib/data",
    ].join("\n");

    expect(publishedPorts(sample)).toEqual(["127.0.0.1:1111:1111", "2222:2222"]);
  });

  it("has no port that answers beyond 127.0.0.1", () => {
    const ports = publishedPorts(readFileSync("docker-compose.yml", "utf8"));

    expect(ports.length).toBeGreaterThan(0);
    expect(ports.filter((port) => !port.startsWith("127.0.0.1:"))).toEqual([]);
  });
});
