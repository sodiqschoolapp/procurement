import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";

import { NextRequest } from "next/server";
import sharp from "sharp";

import { newClientKey } from "@/components/client-key";
import { MAX_FILE_BYTES } from "@/domain/files";

// Invented files for the upload tests (build plan 0.12). Every picture is drawn here, except the
// HEIC: sharp writes no HEIC, so one small invented picture (1600 × 1200, two coloured blocks) was
// made once with pillow-heif and is kept beside this file.

const BASE = "http://localhost:3000";

/** A JPEG of the given size, turned by EXIF orientation 6 and carrying a GPS position. */
export async function jpegWithExif(width: number, height: number): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 3, background: "#2a6fdb" } })
    .withExif({
      IFD0: { Make: "Invented", Model: "Sinov 1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 18/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

export async function picture(
  format: "png" | "webp",
  width: number,
  height: number,
): Promise<Uint8Array> {
  const image = sharp({ create: { width, height, channels: 4, background: "#ff990080" } });
  return (format === "png" ? image.png() : image.webp()).toBuffer();
}

export function heicPhoto(): Uint8Array {
  return readFileSync(join(import.meta.dirname, "files", "photo-1600x1200.heic"));
}

/**
 * The HEIC above with its `ispe` box (the picture's declared size) set to 20 000 × 20 000: a
 * decompression bomb of about a kilobyte, refused before it is decoded (spec review, Should fix 2).
 */
export function heicDeclaringHugePicture(): Uint8Array {
  const bytes = Buffer.from(heicPhoto());
  const box = bytes.indexOf("ispe");
  if (box < 0) throw new Error("The HEIC sample has no ispe box.");
  bytes.writeUInt32BE(20_000, box + 8);
  bytes.writeUInt32BE(20_000, box + 12);
  return bytes;
}

/** A PDF of exactly `size` bytes: its first bytes, then padding (stored as it is). */
export function pdfOfSize(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20);
  bytes.set(Buffer.from("%PDF-1.4\n"));
  return bytes;
}

export const TEN_MB = MAX_FILE_BYTES;

function chunk(type: string, data: Uint8Array): Uint8Array {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A PNG of a few dozen bytes whose header declares 20 000 × 20 000 pixels (review of the plan of
 * 0.12, correction 3): a decompression bomb, refused before it is decoded.
 */
export function pngDeclaringHugePicture(): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(20_000, 0);
  header.writeUInt32BE(20_000, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    chunk("IEND", new Uint8Array()),
  ]);
}

export type Cookie = { name: string; value: string };

/** The upload form of the browser helper, as a request to the route. */
export function uploadRequest(
  bytes: Uint8Array,
  options: { name?: string; purpose?: string; clientKey?: string; cookie?: Cookie } = {},
): NextRequest {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], options.name ?? "rasm.jpg"));
  form.set("purpose", options.purpose ?? "photo");
  form.set("clientKey", options.clientKey ?? newClientKey());
  const headers: Record<string, string> = options.cookie
    ? { cookie: `${options.cookie.name}=${options.cookie.value}` }
    : {};
  return new NextRequest(`${BASE}/files`, { method: "POST", body: form, headers });
}

export function downloadRequest(path: string, cookie?: Cookie): NextRequest {
  const headers: Record<string, string> = cookie
    ? { cookie: `${cookie.name}=${cookie.value}` }
    : {};
  return new NextRequest(`${BASE}${path}`, { headers });
}
