import decodeHeic from "heic-decode";
import sharp, { type Metadata, type Sharp } from "sharp";

import {
  type FileMime,
  type ImageVersion,
  MAX_INPUT_PIXELS,
  VERSION_SIDES,
  isImageMime,
} from "@/domain/files";

// What is stored of an upload (04-catalogs.md rule 6; plan of 0.12, decision 8): for an image the
// two versions, 160 px and 1200 px on the longest side, as JPEG, turned upright by their EXIF
// orientation and with every metadata block (GPS, camera) left out; for a PDF the file as it is.
// The original of an image is not kept.

/** A file that cannot be read as the image its first bytes promised, or is far too large. */
export class NotAnImage extends Error {
  name = "NotAnImage";
}

export type StoredObject = { name: string; body: Uint8Array; contentType: string };

/** The object names under a file's storage key. */
export const OBJECT_NAMES = {
  small: "small.jpg",
  large: "large.jpg",
  original: "original",
} as const;

function tooManyPixels(width: number | undefined, height: number | undefined): boolean {
  return !width || !height || width * height > MAX_INPUT_PIXELS;
}

/**
 * The picture of a HEIC as raw pixels for sharp. sharp's own build reads only AVIF of the HEIF
 * family (plan of 0.12, decision 3). The size is read before anything is decoded (review of the
 * plan, correction 3): heic-decode has no limit of its own.
 */
async function heicPixels(bytes: Uint8Array): Promise<Sharp> {
  let images: Awaited<ReturnType<typeof decodeHeic.all>>;
  try {
    images = await decodeHeic.all({ buffer: bytes });
  } catch {
    throw new NotAnImage("The HEIC file cannot be read.");
  }
  try {
    const first = images[0];
    if (!first || tooManyPixels(first.width, first.height)) {
      throw new NotAnImage("The HEIC picture is missing or too large.");
    }
    const { width, height, data } = await first.decode();
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
      limitInputPixels: MAX_INPUT_PIXELS,
    });
  } catch (error) {
    if (error instanceof NotAnImage) throw error;
    throw new NotAnImage("The HEIC file cannot be decoded.");
  } finally {
    images.dispose();
  }
}

/** JPEG, PNG or WebP: the declared size is read from the header first (correction 3). */
async function imagePixels(bytes: Uint8Array): Promise<Sharp> {
  let metadata: Metadata;
  try {
    // limitInputPixels: false here only: metadata() reads the header and decodes nothing, and the
    // check below must see the declared size to refuse it.
    metadata = await sharp(bytes, { limitInputPixels: false }).metadata();
  } catch {
    throw new NotAnImage("The image cannot be read.");
  }
  if (tooManyPixels(metadata.width, metadata.height)) {
    throw new NotAnImage("The image declares too many pixels.");
  }
  // rotate() with no angle turns the picture upright by its EXIF orientation.
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
}

async function version(pixels: Sharp, side: number): Promise<Uint8Array> {
  try {
    return await pixels
      .clone()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      // A transparent PNG or WebP turns white, not black, as JPEG has no transparency.
      .flatten({ background: "#ffffff" })
      // sharp writes no metadata unless asked: GPS and camera are left out.
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new NotAnImage("The image cannot be decoded.");
  }
}

/** The objects to store for an upload whose type was read from its content. */
export async function objectsOf(bytes: Uint8Array, mime: FileMime): Promise<StoredObject[]> {
  if (!isImageMime(mime)) {
    return [{ name: OBJECT_NAMES.original, body: bytes, contentType: mime }];
  }
  const pixels = mime === "image/heic" ? await heicPixels(bytes) : await imagePixels(bytes);
  const sizes: ImageVersion[] = ["small", "large"];
  const bodies = await Promise.all(sizes.map((size) => version(pixels, VERSION_SIDES[size])));
  return sizes.map((size, index) => ({
    name: OBJECT_NAMES[size],
    body: bodies[index]!,
    contentType: "image/jpeg",
  }));
}
