// The rules of an uploaded file (build plan 0.12): which types are allowed, how they are told
// apart, the size limit, and the sizes the server and the browser make. Pure: the upload route
// and the browser helper both import it.

/** The types a file may have, as stored in `files.mime` (14-data-model.md, files). */
export const FILE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
export type FileMime = (typeof FILE_MIMES)[number];

/** "JPG, PNG, WebP or HEIC" (04-catalogs.md rule 6). */
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;

/**
 * What an upload is for. `photo`: an image only (04-catalogs.md rule 6). `document`: an image or
 * a PDF, for a receipt ("0 to 5 photos or PDF files", 07-purchasing.md, Receipt). The attaching
 * action of each later task checks that the file's type fits its own field ("PDF where a task
 * allows it").
 */
export const FILE_PURPOSES = ["photo", "document"] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/**
 * "Up to 10 MB" (04-catalogs.md rule 6): 10 × 1024 × 1024 bytes, the size a phone and a computer
 * show as "10 MB"; the same limit for a PDF (plan of 0.12, decision 11).
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** The longest side of a stored version: 160 px for lists, 1200 px for viewing (04 rule 6). */
export const VERSION_SIDES = { small: 160, large: 1200 } as const;
export type ImageVersion = keyof typeof VERSION_SIDES;

/** The sizes the download route answers: the two versions of an image, the file of a PDF. */
export const DOWNLOAD_SIZES = ["small", "large", "original"] as const;
export type DownloadSize = (typeof DOWNLOAD_SIZES)[number];

/**
 * The most pixels an image may declare, read before it is decoded: sharp's own default
 * `limitInputPixels` (review of the plan of 0.12, correction 3). A 10 MB file can declare a
 * picture far larger than its bytes; this refuses it before any memory is spent on it.
 */
export const MAX_INPUT_PIXELS = 268_402_689;

// The major brands of a HEIC file, exactly those heic-decode accepts (the `ftyp` box at byte 4):
// a file of another brand (`heim`, `heis`) could not be decoded, so it is refused as a type
// (spec review of 0.12, Should fix 1).
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/**
 * The type of a file by its first bytes, never by its name (developer-rules.md rule 13: "Uploads
 * are checked by content, not by file name"). `null` for anything else.
 */
export function sniffMime(bytes: Uint8Array): FileMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).replace("\0", " ").trim();
    if (HEIC_BRANDS.has(brand)) return "image/heic";
  }
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export function isImageMime(mime: FileMime): boolean {
  return (IMAGE_MIMES as readonly string[]).includes(mime);
}

/** Whether a type may be uploaded for a purpose: a PDF only as a document. */
export function allowedFor(purpose: FilePurpose, mime: FileMime): boolean {
  return purpose === "document" || isImageMime(mime);
}

/** The browser's name of a file, as stored: trimmed, at most 255 characters, never empty. */
export function storedName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "file";
  return Array.from(trimmed).slice(0, 255).join("");
}

/** The longest side the browser redraws a large photo to (plan of 0.12, decision 12). */
export const SHRINK_SIDE = 2400;
/** A photo above this many bytes is redrawn even when its sides are small (decision 12). */
export const SHRINK_BYTES = 2 * 1024 * 1024;
/** The JPEG quality of a redrawn photo (decision 12). */
export const SHRINK_QUALITY = 0.85;

/**
 * Whether and to what size the browser redraws a photo before upload (edge-cases/system.md: "A
 * phone photo is very large. It is shrunk in the browser before upload"). `null`: sent as it is.
 */
export function shrinkTarget(
  width: number,
  height: number,
  bytes: number,
): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (longest <= SHRINK_SIDE && bytes <= SHRINK_BYTES) return null;
  if (longest <= SHRINK_SIDE) return { width, height };
  const scale = SHRINK_SIDE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
