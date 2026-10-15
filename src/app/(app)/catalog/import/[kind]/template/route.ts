import type { NextRequest } from "next/server";

import { IMPORT_PERMISSIONS, isImportKind } from "@/domain/imports";
import { importSheetName, importTitles } from "@/features/catalog/imports/titles";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize } from "@/server/authorize";
import { writeTemplate } from "@/server/excel";

// The template of an import, GET /catalog/import/<kind>/template (build-plan 1.10: "template
// download"; plan of 1.10, decision 16; plan of 1.11 for prices): the column titles in the Head's
// language, no data rows. A signed-out visitor gets 401; anyone without the kind's permission, and
// an unknown kind, 404, as the download route answers (03-roles-and-permissions.md rule 1).

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const notFound = () => new Response(null, { status: 404 });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return new Response(null, { status: 401 });
  // The kind first, then its own permission (plan of 1.11, decision 4): an unknown kind is 404
  // for everyone, as before.
  const { kind } = await context.params;
  if (!isImportKind(kind)) return notFound();
  try {
    await authorize(user.id, IMPORT_PERMISSIONS[kind]);
  } catch (error) {
    if (error instanceof AuthorizationError) return notFound();
    throw error;
  }
  const bytes = await writeTemplate(
    importSheetName(kind, user.locale),
    importTitles(kind, user.locale),
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${kind}-template.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
