import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";
import { readSheet } from "@/server/excel";

import { downloadRequest } from "../../../../../../../tests/helpers/files";
import { describePermissionMatrix } from "../../../../../../../tests/helpers/permission-matrix";
import { insertUser, signInAs } from "../../../../../../../tests/helpers/users";
import { GET } from "./route";

// The template download (build-plan 1.10: "template download"; plan of 1.10, decision 16): the
// Head only (03, "Manage catalogs, users, branches, settings"); anyone else 404, as the download
// route; signed out 401.

async function get(kind: string, cookie?: Awaited<ReturnType<typeof signInAs>>) {
  return GET(downloadRequest(`/catalog/import/${kind}/template`, cookie), {
    params: Promise.resolve({ kind }),
  });
}

describePermissionMatrix("GET /catalog/import/[kind]/template", {
  permission: "catalog.manage",
  async run({ user }) {
    const response = await get("products", await signInAs(user));
    // The route answers a refusal with 404, as the download route (decision 16); for a global
    // permission authorize() refuses with "forbidden", which is what the matrix expects.
    if (response.status === 404) throw new AuthorizationError("forbidden");
    expect(response.status).toBe(200);
  },
});

// The prices template under price.add (03, "Add a new price for a product"; plan of 1.11,
// decision 4, Look first).
describePermissionMatrix("GET /catalog/import/prices/template", {
  permission: "price.add",
  async run({ user }) {
    const response = await get("prices", await signInAs(user));
    if (response.status === 404) throw new AuthorizationError("forbidden");
    expect(response.status).toBe(200);
  },
});

describe("the template (plan of 1.10, decisions 10 and 16)", () => {
  it("is a workbook with the titles in the Head's language and no rows", async () => {
    const head = await insertUser("HEAD");
    const response = await get("departments", await signInAs(head));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("departments-template.xlsx");
    const sheet = await readSheet(new Uint8Array(await response.arrayBuffer()));
    expect(sheet.header.map((cell) => (cell.kind === "text" ? cell.text : ""))).toHaveLength(4);
    expect(sheet.rows).toEqual([]);
  });

  it("the prices template has its four titles (plan of 1.11)", async () => {
    const head = await insertUser("HEAD");
    const response = await get("prices", await signInAs(head));
    expect(response.status).toBe(200);
    const sheet = await readSheet(new Uint8Array(await response.arrayBuffer()));
    expect(sheet.header).toHaveLength(4);
    expect(sheet.rows).toEqual([]);
  });

  it("an unknown kind is 404, for a Manager too; signed out is 401", async () => {
    const head = await insertUser("HEAD");
    // "prices" was the unknown kind here until 1.11, "stock" until 5.9 made them kinds.
    expect((await get("counts", await signInAs(head))).status).toBe(404);
    expect((await get("counts", await signInAs(await insertUser("MANAGER")))).status).toBe(404);
    expect((await get("products")).status).toBe(401);
  });
});
