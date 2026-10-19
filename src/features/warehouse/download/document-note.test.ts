import { describe, expect, it } from "vitest";

import type { DocumentNote } from "../queries/document-note";
import { documentNoteSheet } from "./document-note";

// The transfer note's texts (09-warehouse.md, Other documents, Transfer: "a PDF transfer note
// naming who sent the items and who received them, as typed, with no signature lines"; 05
// Download 2 and 3: who downloaded it and when, in the downloader's language; plan of 7.1,
// decided items 6 and 12). The PDF itself is read in transfer-route.db.test.ts.

const TRANSFER: DocumentNote = {
  type: "TRANSFER",
  number: "TRF-DEMO-31-0007",
  status: "IN_TRANSIT",
  docDate: "2031-05-02",
  branchCode: "DEMO",
  branchName: "Sinov filiali",
  departmentName: null,
  toBranchCode: "TEST",
  toBranchName: "Boshqa filial",
  givenBy: "Sinov Yuboruvchi",
  receivedBy: null,
  comment: null,
  lines: [{ productName: "Sinov daftar", subtypeName: null, qty: "4", unitShortName: "dona" }],
  downloadedBy: "Sinov Yuklovchi",
  schoolName: null,
};

const AT = new Date("2031-05-03T06:00:00Z");

describe("documentNoteSheet for a transfer (plan of 7.1, decided item 12)", () => {
  it("names both branches, who sent it and who receives, with a dash for nobody named; no signature field", () => {
    const sheet = documentNoteSheet(TRANSFER, "en", AT);
    expect(sheet.title).toBe("Transfer note TRF-DEMO-31-0007");
    expect(sheet.fields).toEqual([
      { label: "Number", value: "TRF-DEMO-31-0007" },
      { label: "Date", value: "02.05.2031" },
      { label: "From branch", value: "DEMO · Sinov filiali" },
      { label: "To branch", value: "TEST · Boshqa filial" },
      { label: "Sent by", value: "Sinov Yuboruvchi" },
      { label: "Received by", value: "—" },
    ]);
    expect(sheet.downloadedLine).toBe("Downloaded by Sinov Yuklovchi, 03.05.2031 11:00");
    expect(JSON.stringify(sheet)).not.toMatch(/signature/i);
  });

  it("shows the receiver as typed (09 Transfer: 'as typed')", () => {
    const sheet = documentNoteSheet({ ...TRANSFER, receivedBy: "Sinov Haydovchi" }, "en", AT);
    expect(sheet.fields.at(-1)).toEqual({ label: "Received by", value: "Sinov Haydovchi" });
  });

  it("is in the downloader's language (05 Download 3)", () => {
    expect(documentNoteSheet(TRANSFER, "ru", AT).title).toBe(
      "Накладная на перемещение TRF-DEMO-31-0007",
    );
    expect(documentNoteSheet(TRANSFER, "uz", AT).title).toBe(
      "Koʻchirish yuk xati TRF-DEMO-31-0007",
    );
  });

  it("an issue keeps its own fields (plan of 5.4)", () => {
    const sheet = documentNoteSheet(
      { ...TRANSFER, type: "ISSUE", departmentName: "Sinov bo'limi", toBranchCode: null },
      "en",
      AT,
    );
    expect(sheet.title).toBe("Issue note TRF-DEMO-31-0007");
    expect(sheet.fields.map((field) => field.label)).toEqual([
      "Number",
      "Date",
      "Branch",
      "Department",
      "Given by",
      "Received by",
    ]);
  });
});
