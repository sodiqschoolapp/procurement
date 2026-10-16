import type { NextRequest } from "next/server";

import { businessDate } from "@/domain/business-date";
import { downloadSheet } from "@/features/orders/download/columns";
import { writeOrdersExcel } from "@/features/orders/download/excel";
import { writeOrdersPdf } from "@/features/orders/download/pdf";
import { parseListFilters } from "@/features/orders/list-filters";
import { orderDownload } from "@/features/orders/queries/order-list";
import { LOCALE_COOKIE, chooseLocale } from "@/i18n/locale";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";

// The order list's download, GET /orders/download/excel and /orders/download/pdf
// (05-order-request-form.md, Download; 11 Order list layout 1; plan of 2.14, decided item 12: a
// route that writes nothing, as the import template and the file route). The filters are the
// list's address parameters; the list page puts its effective filters into the links. A signed-
// out visitor gets 401; an unknown format, and a `branch=` the user may not see, 404 (03 rule 1;
// plan of 0.7, item 5). The language is the screen's: the user's, then the cookie (plan review,
// correction 4).

const FORMATS = {
  excel: {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    write: writeOrdersExcel,
  },
  pdf: { type: "application/pdf", extension: "pdf", write: writeOrdersPdf },
} as const;

const notFound = () => new Response(null, { status: 404 });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ format: string }> },
): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return new Response(null, { status: 401 });
  const { format } = await context.params;
  if (format !== "excel" && format !== "pdf") return notFound();
  const { filters } = parseListFilters(Object.fromEntries(request.nextUrl.searchParams));

  let download;
  try {
    // The route's own check; orderDownload() asks again, with the `branch=` filter's branch.
    await authorizeList(user.id, "data.export");
    download = await orderDownload(user.id, filters);
  } catch (error) {
    if (error instanceof AuthorizationError) return notFound();
    throw error;
  }
  const at = now();
  const locale = chooseLocale({
    userLocale: user.locale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
  });
  const file = FORMATS[format];
  const bytes = await file.write(downloadSheet(download, filters, locale, at));
  return new Response(bytes, {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="orders-${businessDate(at)}.${file.extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
