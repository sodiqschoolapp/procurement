import type { NextRequest } from "next/server";

import {
  documentNoteSheet,
  writeDocumentNotePdf,
} from "@/features/warehouse/download/document-note";
import { getDocumentNote } from "@/features/warehouse/queries/document-note";
import { LOCALE_COOKIE, chooseLocale } from "@/i18n/locale";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";

// The issue note and the transfer note, GET /warehouse/documents/[id]/note (09-warehouse.md,
// Issue to a department 2; Other documents, Transfer; plan of 7.1, decided item 12; plan of 5.4,
// decided item 8: a route that writes nothing, as the order list download). A
// signed-out visitor gets 401; an unknown id and another branch's document 404 (03 rule 1). The
// language is the screen's: the user's, then the cookie (05 Download 3).

const notFound = () => new Response(null, { status: 404 });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return new Response(null, { status: 401 });
  const { id } = await context.params;

  let note;
  try {
    // The route's own check; getDocumentNote() asks data.export again on the document's branch.
    await authorizeList(user.id, "data.export");
    note = await getDocumentNote(user.id, id);
  } catch (error) {
    if (error instanceof AuthorizationError) return notFound();
    throw error;
  }
  if (!note) return notFound();
  const locale = chooseLocale({
    userLocale: user.locale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
  });
  const bytes = await writeDocumentNotePdf(documentNoteSheet(note, locale, now()));
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${note.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
