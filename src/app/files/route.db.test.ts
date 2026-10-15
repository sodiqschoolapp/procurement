import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { db } from "@/server/db/client";
import { files } from "@/server/db/schema";

import { s3ClientOf, storageConfigOf } from "../../../scripts/ensure-bucket.mjs";
import {
  TEN_MB,
  downloadRequest,
  heicDeclaringHugePicture,
  heicPhoto,
  jpegWithExif,
  pdfOfSize,
  picture,
  pngDeclaringHugePicture,
  uploadRequest,
} from "../../../tests/helpers/files";
import { createProduct, setProductActive } from "@/features/catalog/actions/products";
import { createSubtype } from "@/features/catalog/actions/subtypes";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

import { insertBranch } from "../../../tests/helpers/branches";
import { insertCategory, insertProduct, insertUnit } from "../../../tests/helpers/catalog";
import { insertUser, signInAs } from "../../../tests/helpers/users";
import { GET } from "./[id]/[size]/route";
import { POST } from "./route";

// The upload and download routes against PostgreSQL and the SeaweedFS of docker-compose.yml
// (build plan 0.12, Done when; plan of 0.12, Tests). Nothing is mocked. The through-the-app
// checks (401 past the proxy, an upload of exactly 10 MB over HTTP) are tests/e2e/files.spec.ts.

const s3 = s3ClientOf(storageConfigOf(process.env));
afterAll(() => s3.destroy());

/** The objects of the tests' bucket: only this file writes to it. */
async function objectCount(): Promise<number> {
  let count = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, ContinuationToken: token }),
    );
    count += page.KeyCount ?? 0;
    token = page.NextContinuationToken;
  } while (token);
  return count;
}

async function signedIn(role: "HEAD" | "MANAGER" | "PRINCIPAL" | "FINANCE" = "MANAGER") {
  const user = await insertUser(role);
  return { user, cookie: await signInAs(user) };
}

async function rowsOf(userId: string) {
  return db.select().from(files).where(eq(files.uploadedBy, userId));
}

async function uploaded(response: Response): Promise<string> {
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(201);
  expect(body).toMatchObject({ ok: true });
  return body.data.id;
}

async function download(id: string, size: string, cookie: { name: string; value: string }) {
  return GET(downloadRequest(`/files/${id}/${size}`, cookie), {
    params: Promise.resolve({ id, size }),
  });
}

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function imageOf(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  return sharp(Buffer.from(await response.arrayBuffer())).metadata();
}

describe("what the upload refuses (developer-rules.md rule 13; 04-catalogs.md rule 6)", () => {
  it("a text file renamed .jpg is refused by its content: no row, no object (build plan 0.12, Done when)", async () => {
    const { user, cookie } = await signedIn();
    const before = await objectCount();
    const text = new TextEncoder().encode("Bu oddiy matn, rasm emas. ".repeat(40));

    const response = await POST(uploadRequest(text, { name: "chek.jpg", cookie }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_an_allowed_type", messageKey: "errors.file.notAllowedType" },
    });
    expect(await rowsOf(user.id)).toEqual([]);
    expect(await objectCount()).toBe(before);
  });

  it("an 11 MB file is refused as too large, before its body is read to the end (Done when)", async () => {
    const { user, cookie } = await signedIn();
    const request = uploadRequest(pdfOfSize(11 * 1024 * 1024), { purpose: "document", cookie });
    // No declared length: the route counts what it reads and stops at the limit.
    request.headers.delete("content-length");
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "too_large" } });
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("an 11 MB file that declares its length is refused before a byte is read", async () => {
    const { cookie } = await signedIn();
    const request = uploadRequest(pdfOfSize(11 * 1024 * 1024), { purpose: "document", cookie });
    const sent = new Request(request.url, {
      method: "POST",
      headers: {
        ...Object.fromEntries(request.headers),
        "content-length": String(11 * 1024 * 1024 + 300),
      },
      body: request.body,
      duplex: "half",
    } as RequestInit);
    const response = await POST(new NextRequest(sent));
    expect(response.status).toBe(413);
  });

  it("10 MB exactly is kept; 10 MB and one byte is refused (decision 11: 10 485 760 bytes)", async () => {
    const { user, cookie } = await signedIn();
    const atLimit = await POST(uploadRequest(pdfOfSize(TEN_MB), { purpose: "document", cookie }));
    await uploaded(atLimit);
    const over = await POST(uploadRequest(pdfOfSize(TEN_MB + 1), { purpose: "document", cookie }));
    expect(over.status).toBe(413);
    expect(await rowsOf(user.id)).toMatchObject([{ sizeBytes: TEN_MB, mime: "application/pdf" }]);
  });

  it("a PDF is refused as a photo and kept as it is as a document (07-purchasing.md, Receipt)", async () => {
    const { cookie } = await signedIn();
    const pdf = pdfOfSize(2048);
    const asPhoto = await POST(uploadRequest(pdf, { name: "chek.pdf", cookie }));
    expect(asPhoto.status).toBe(415);

    const id = await uploaded(
      await POST(uploadRequest(pdf, { name: "chek.pdf", purpose: "document", cookie })),
    );
    const original = await download(id, "original", cookie);
    expect(original.status).toBe(200);
    expect(original.headers.get("content-type")).toBe("application/pdf");
    expect(original.headers.get("content-security-policy")).toBe("sandbox");
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(pdf);
    // A PDF has no versions.
    expect((await download(id, "large", cookie)).status).toBe(404);
  });

  it("a picture whose header declares 400 million pixels is refused before it is decoded (review correction 3)", async () => {
    const { user, cookie } = await signedIn();
    const response = await POST(
      uploadRequest(pngDeclaringHugePicture(), { name: "a.png", cookie }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "not_an_image" } });
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("a HEIC whose header declares 400 million pixels is refused before it is decoded (review correction 3)", async () => {
    const { user, cookie } = await signedIn();
    const response = await POST(
      uploadRequest(heicDeclaringHugePicture(), { name: "a.heic", cookie }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "not_an_image" } });
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("a JPEG whose bytes break after its first ones is refused as not an image", async () => {
    const { cookie } = await signedIn();
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(7)]);
    expect((await POST(uploadRequest(broken, { cookie }))).status).toBe(422);
  });

  it("a signed-out upload is refused with 401 and writes nothing", async () => {
    const before = await objectCount();
    const response = await POST(uploadRequest(await jpegWithExif(40, 30)));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "signed_out" } });
    expect(await objectCount()).toBe(before);
  });

  it("a form without a client key, or with an unknown purpose, is invalid input", async () => {
    const { cookie } = await signedIn();
    const photo = await jpegWithExif(40, 30);
    expect((await POST(uploadRequest(photo, { clientKey: "bir", cookie }))).status).toBe(400);
    expect((await POST(uploadRequest(photo, { purpose: "avatar", cookie }))).status).toBe(400);
  });
});

describe("one upload makes both sizes (04-catalogs.md rule 6; build plan 0.12, Done when)", () => {
  it("a 3000 × 2000 JPEG becomes 160 px and 1200 px, upright, with no GPS", async () => {
    const { user, cookie } = await signedIn("FINANCE");
    const id = await uploaded(
      await POST(uploadRequest(await jpegWithExif(3000, 2000), { name: "  chek.jpg ", cookie })),
    );

    // Orientation 6 turns the picture: 2000 wide, 3000 high.
    const small = await imageOf(await download(id, "small", cookie));
    expect([small.width, small.height]).toEqual([107, 160]);
    const large = await imageOf(await download(id, "large", cookie));
    expect([large.width, large.height]).toEqual([800, 1200]);
    expect(large.exif).toBeUndefined();
    expect(large.orientation).toBeUndefined();
    expect((await download(id, "original", cookie)).status).toBe(404);

    expect(await rowsOf(user.id)).toMatchObject([
      { id, originalName: "chek.jpg", mime: "image/jpeg" },
    ]);
  });

  it.each([
    ["PNG", "image/png", () => picture("png", 2400, 1600), [1200, 800]],
    ["WebP", "image/webp", () => picture("webp", 300, 200), [300, 200]],
    ["HEIC", "image/heic", async () => heicPhoto(), [1200, 900]],
  ] as const)("a %s makes both sizes, never enlarged", async (_, mime, make, largeSize) => {
    const { user, cookie } = await signedIn();
    const id = await uploaded(await POST(uploadRequest(await make(), { name: "rasm", cookie })));

    const small = await imageOf(await download(id, "small", cookie));
    expect(Math.max(small.width!, small.height!)).toBe(160);
    const large = await imageOf(await download(id, "large", cookie));
    expect([large.width, large.height]).toEqual(largeSize);
    expect(await rowsOf(user.id)).toMatchObject([{ mime }]);
  });
});

describe("safe repeats (developer-rules.md rule 8; plan of 0.12, decisions 6 and 9)", () => {
  it("the same client key twice gives one row and the first id", async () => {
    const { user, cookie } = await signedIn();
    const clientKey = newClientKey();
    const photo = await jpegWithExif(64, 48);
    const first = await uploaded(await POST(uploadRequest(photo, { clientKey, cookie })));
    const second = await uploaded(await POST(uploadRequest(photo, { clientKey, cookie })));

    expect(second).toBe(first);
    expect(await rowsOf(user.id)).toHaveLength(1);
  });

  it("the same client key from another user is Not found and leaves no row (decision 15)", async () => {
    const maker = await signedIn();
    const other = await signedIn();
    const clientKey = newClientKey();
    const photo = await jpegWithExif(64, 48);
    await uploaded(await POST(uploadRequest(photo, { clientKey, cookie: maker.cookie })));

    const response = await POST(uploadRequest(photo, { clientKey, cookie: other.cookie }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await rowsOf(other.user.id)).toEqual([]);
  });
});

describe("who may download (build plan 0.12; plan of 0.12, decision 5, Look first)", () => {
  it("a signed-out request for a file address is refused with 401 and no body (Done when)", async () => {
    const { cookie } = await signedIn();
    const id = await uploaded(await POST(uploadRequest(await jpegWithExif(40, 30), { cookie })));

    const response = await GET(downloadRequest(`/files/${id}/large`), {
      params: Promise.resolve({ id, size: "large" }),
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("a file no record holds goes to its uploader only; the Head and a colleague get Not found, as for a made-up id", async () => {
    const { id: branchId } = await insertBranch();
    const maker = await insertUser("MANAGER", { branches: [branchId] });
    const colleague = await insertUser("MANAGER", { branches: [branchId] });
    const head = await insertUser("HEAD");
    const makerCookie = await signInAs(maker);
    const id = await uploaded(
      await POST(uploadRequest(await jpegWithExif(40, 30), { cookie: makerCookie })),
    );

    expect((await download(id, "small", makerCookie)).status).toBe(200);
    for (const someone of [colleague, head]) {
      const response = await download(id, "small", await signInAs(someone));
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
    const madeUp = "00000000-0000-4000-8000-000000000001";
    expect((await download(madeUp, "small", makerCookie)).status).toBe(404);
  });

  it("a product's photo downloads for every role, the product active or not (plan of 1.7, decision 5, Look first)", async () => {
    const head = await insertUser("HEAD");
    const headCookie = await signInAs(head);
    const id = await uploaded(
      await POST(uploadRequest(await jpegWithExif(40, 30), { cookie: headCookie })),
    );
    const product = expectOk(
      (await runAction(createProduct, head.id, {
        clientKey: newClientKey(),
        name: `Rasmli mahsulot ${newClientKey()}`,
        categoryId: (await insertCategory()).id,
        unitId: (await insertUnit()).id,
        photoFileId: id,
      })) as ActionResult<{ id: string }>,
    );
    const { id: branchId } = await insertBranch();
    const readers = [
      head,
      await insertUser("MANAGER", { branches: [branchId] }),
      await insertUser("PRINCIPAL", { branches: [branchId] }),
      await insertUser("FINANCE", { branches: [branchId] }),
    ];
    for (const reader of readers) {
      expect((await download(id, "small", await signInAs(reader))).status).toBe(200);
    }
    expectOk(await runAction(setProductActive, head.id, { id: product.id, active: false }));
    const manager = readers[1]!;
    expect((await download(id, "large", await signInAs(manager))).status).toBe(200);
  });

  it("a subtype's own photo downloads for every role through the real file owners (plan of 1.8, decision 8; permission review, Should fix 1)", async () => {
    const head = await insertUser("HEAD");
    const headCookie = await signInAs(head);
    const id = await uploaded(
      await POST(uploadRequest(await jpegWithExif(40, 30), { cookie: headCookie })),
    );
    const product = await insertProduct();
    expectOk(
      (await runAction(createSubtype, head.id, {
        clientKey: newClientKey(),
        productId: product.id,
        name: "A4",
        photoFileId: id,
      })) as ActionResult<unknown>,
    );
    const { id: branchId } = await insertBranch();
    for (const reader of [
      head,
      await insertUser("MANAGER", { branches: [branchId] }),
      await insertUser("PRINCIPAL", { branches: [branchId] }),
      await insertUser("FINANCE", { branches: [branchId] }),
    ]) {
      expect((await download(id, "small", await signInAs(reader))).status).toBe(200);
    }
  });

  it("an address that is no file id or no size is Not found", async () => {
    const { cookie } = await signedIn();
    expect((await download("bir", "small", cookie)).status).toBe(404);
    expect((await download("00000000-0000-4000-8000-000000000001", "huge", cookie)).status).toBe(
      404,
    );
  });

  it("an image answers private, never sniffed by the browser", async () => {
    const { cookie } = await signedIn();
    const id = await uploaded(await POST(uploadRequest(await jpegWithExif(40, 30), { cookie })));
    const response = await download(id, "small", cookie);
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
