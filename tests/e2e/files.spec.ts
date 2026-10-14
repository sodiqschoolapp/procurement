import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_USER } from "./global-setup";

// Build plan 0.12 through the running app (plan of 0.12, decision 7, Look first; review of the
// plan, Must fix 5): /files is outside the proxy, so a signed-out request gets 401 and not a
// redirect to /login, and an upload of exactly 10 MB is not cut by the proxy's body buffer. The
// route's own checks are src/app/files/route.db.test.ts. No page: the requests go to the server.

const TEN_MB = 10 * 1024 * 1024;

function pdfOfSize(size: number): Buffer {
  const bytes = Buffer.alloc(size, 0x20);
  bytes.write("%PDF-1.4\n", 0, "ascii");
  return bytes;
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(uz.login.username).fill(E2E_USER.username);
  await page.getByLabel(uz.login.password).fill(E2E_USER.password);
  await page.getByRole("button", { name: uz.login.submit }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("an upload of exactly 10 MB passes the running app, and its uploader gets it back", async ({
  page,
}) => {
  await signIn(page);
  const pdf = pdfOfSize(TEN_MB);
  const response = await page.request.post("/files", {
    multipart: {
      file: { name: "chek.pdf", mimeType: "application/pdf", buffer: pdf },
      purpose: "document",
      clientKey: randomUUID(),
    },
  });
  expect(response.status()).toBe(201);
  const { data } = (await response.json()) as { data: { id: string } };

  const back = await page.request.get(`/files/${data.id}/original`);
  expect(back.status()).toBe(200);
  expect((await back.body()).length).toBe(TEN_MB);
});

test("a signed-out request for a file address gets 401, not the sign-in page", async ({
  playwright,
  baseURL,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  try {
    const download = await anonymous.get(`/files/${randomUUID()}/large`, { maxRedirects: 0 });
    expect(download.status()).toBe(401);
    expect(await download.text()).toBe("");

    const upload = await anonymous.post("/files", {
      multipart: { purpose: "photo", clientKey: randomUUID() },
      maxRedirects: 0,
    });
    expect(upload.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});
