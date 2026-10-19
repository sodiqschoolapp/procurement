import { describe, expect, it } from "vitest";

import { NO_ANALYTICS_FILTERS, analyticsSearch } from "@/features/analytics/period-params";

import { bought, refreshNow, spendingScene } from "../../../../../tests/helpers/analytics";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { pdfPages } from "../../../../../tests/helpers/pdf-text";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { GET } from "./route";

// The Analytics PDF in the downloader's language (05-order-request-form.md, Download 3: "both use
// the language of the user who downloads them"; build-plan 6.7). Its own file, so its PDF is the
// process's first: @react-pdf/renderer loses letters in a PDF made after a Russian one in the same
// process (progress 3.5; plan of 6.7, decided item 9, Look first).

describe("GET /analytics/report in Russian (05 Download 3)", () => {
  it("a Russian user's file: the titles, the period and the total in Russian", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "6000" });
    await refreshNow();
    const principal = await insertUser("PRINCIPAL", {
      branches: [scene.branch.id],
      fullName: "Invented Russian Reader",
      locale: "ru",
    });
    const query = analyticsSearch(
      { choice: "this_month", from: null, to: null },
      NO_ANALYTICS_FILTERS,
    );
    const response = await GET(
      downloadRequest(`/analytics/report?${query}`, await signInAs(principal)),
    );
    expect(response.status).toBe(200);

    const pages = await pdfPages(new Uint8Array(await response.arrayBuffer()));
    const text = pages.join(" ");
    expect(pages[0]).toContain("Аналитика");
    expect(pages[0]).toContain("Период: 01.10.2031 – 31.10.2031");
    expect(pages[0]).toContain("Скачал(а) Invented Russian Reader, 15.10.2031 10:00");
    expect(text).toContain("Расходы");
    expect(text).toContain("Потрачено за период 6 000 so'm");
    expect(text).toContain("Склад");
  });
});
