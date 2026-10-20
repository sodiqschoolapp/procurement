import { describe, expect, it } from "vitest";

import {
  MAX_FILE_BYTES,
  allowedFor,
  shrinkTarget,
  sniffMime,
  storedName,
  versionSide,
} from "./files";

const bytes = (...values: (number | string)[]): Uint8Array =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string" ? Array.from(value, (char) => char.charCodeAt(0)) : [value],
    ),
  );

describe("the type of a file is read from its content (developer-rules.md rule 13)", () => {
  it("finds JPEG, PNG, WebP, HEIC and PDF by their first bytes (04-catalogs.md rule 6; 07 Receipt)", () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffMime(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(bytes(0, 0, 0, 0x1c, "ftypheic", 0, 0, 0, 0))).toBe("image/heic");
    for (const brand of ["heic", "heix", "hevc", "hevx", "mif1", "msf1"]) {
      expect(sniffMime(bytes(0, 0, 0, 0x1c, `ftyp${brand}`, 0, 0, 0, 0)), brand).toBe("image/heic");
    }
    expect(sniffMime(bytes("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("a text file, whatever its name, is no allowed type", () => {
    expect(sniffMime(bytes("Bu oddiy matn, rasm emas.\n"))).toBeNull();
    expect(sniffMime(bytes())).toBeNull();
  });

  it("an AVIF, a GIF and an SVG are not among the four photo types (04 rule 6)", () => {
    expect(sniffMime(bytes(0, 0, 0, 0x1c, "ftypavif", 0, 0, 0, 0))).toBeNull();
    expect(sniffMime(bytes("GIF89a"))).toBeNull();
    expect(sniffMime(bytes("<svg xmlns="))).toBeNull();
  });
});

describe("what each purpose allows (build plan 0.12: PDF where a task allows it)", () => {
  it("a photo is an image only; a document is an image or a PDF", () => {
    expect(allowedFor("photo", "image/heic")).toBe(true);
    expect(allowedFor("photo", "application/pdf")).toBe(false);
    expect(allowedFor("document", "image/png")).toBe(true);
    expect(allowedFor("document", "application/pdf")).toBe(true);
  });

  it("10 MB is 10 485 760 bytes (04 rule 6; plan of 0.12, decision 11)", () => {
    expect(MAX_FILE_BYTES).toBe(10_485_760);
  });
});

describe("the stored file name (plan of 0.12, review Should fix 6)", () => {
  it("is trimmed, cut to 255 characters, and never empty", () => {
    expect(storedName("  chek.jpg ")).toBe("chek.jpg");
    expect(storedName("   ")).toBe("file");
    expect(storedName("a".repeat(300))).toHaveLength(255);
    // Cut by characters, not by UTF-16 units: an emoji is never split in two.
    expect(Array.from(storedName("😀".repeat(300)))).toHaveLength(255);
  });
});

describe("the browser shrinks a large photo (edge-cases/system.md, 'A phone photo is very large')", () => {
  it("a 4032 × 3024 phone photo becomes 2400 × 1800", () => {
    expect(shrinkTarget(4032, 3024, 3_500_000, "photo")).toEqual({ width: 2400, height: 1800 });
  });

  it("a small, light photo is sent as it is", () => {
    expect(shrinkTarget(1000, 800, 400_000, "photo")).toBeNull();
  });

  it("a heavy photo of small sides is re-encoded at its own size", () => {
    expect(shrinkTarget(1000, 800, 2_500_000, "photo")).toEqual({ width: 1000, height: 800 });
  });

  it("a tall photo keeps its shape", () => {
    expect(shrinkTarget(3024, 4032, 100, "photo")).toEqual({ width: 1800, height: 2400 });
  });
});

describe("a receipt keeps 2 500 px (07-purchasing.md, Receipt; D55 item 7; plan of 8.2b)", () => {
  it("a 1 000 × 4 000 receipt is redrawn to 625 × 2 500, a catalog photo to 600 × 2 400", () => {
    expect(shrinkTarget(1000, 4000, 100, "document")).toEqual({ width: 625, height: 2500 });
    expect(shrinkTarget(1000, 4000, 100, "photo")).toEqual({ width: 600, height: 2400 });
  });

  it("a receipt of 2 500 px and under 2 MB is sent as it is", () => {
    expect(shrinkTarget(2500, 1800, 1_900_000, "document")).toBeNull();
  });

  it("is stored at 2 500 px beside the 160 px thumbnail; a catalog photo keeps 160 and 1 200", () => {
    expect([versionSide("small", "document"), versionSide("large", "document")]).toEqual([
      160, 2500,
    ]);
    expect([versionSide("small", "photo"), versionSide("large", "photo")]).toEqual([160, 1200]);
  });
});
