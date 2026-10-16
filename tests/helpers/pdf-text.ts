import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// The text of a PDF, page by page, as a reader sees it (build-plan 2.14, Done when: "a test that
// reads … the text of the PDF"; plan of 2.14, decided item 2: pdfjs-dist, for tests only). The
// items of a page are joined with spaces, so a value split over two text runs still reads whole.

export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const document = await task.promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  await task.destroy();
  return pages;
}
