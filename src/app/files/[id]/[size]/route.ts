import type { NextRequest } from "next/server";
import * as z from "zod";

import { DOWNLOAD_SIZES, isImageMime } from "@/domain/files";
import { fileForDownload } from "@/features/files/queries/file-for-download";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize } from "@/server/authorize";
import { OBJECT_NAMES } from "@/server/files/process";
import { getObject } from "@/server/storage";

// The download route, GET /files/<id>/<size> (build plan 0.12), `size` = small | large for an
// image, original for a PDF. Outside the proxy (plan of 0.12, decision 7): a signed-out visitor
// gets 401 with no body. Then the record the file belongs to decides through authorize()
// (fileForDownload; decision 5). Every other refusal is 404, the same as for an id that does not
// exist (03-roles-and-permissions.md rule 1). The bucket is private; the bytes pass through here.

const params = z.object({ id: z.uuid(), size: z.enum(DOWNLOAD_SIZES) });

const notFound = () => new Response(null, { status: 404 });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; size: string }> },
): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return new Response(null, { status: 401 });

  const parsed = params.safeParse(await context.params);
  if (!parsed.success) return notFound();
  const { id, size } = parsed.data;

  let file: Awaited<ReturnType<typeof fileForDownload>>;
  try {
    // The route's own gate: an active user of the matrix (every role holds file.upload); the
    // file's record decides next, inside fileForDownload (developer-rules.md rule 4).
    await authorize(user.id, "file.upload");
    file = await fileForDownload(user.id, id);
  } catch (error) {
    if (error instanceof AuthorizationError) return notFound();
    throw error;
  }

  const image = isImageMime(file.mime);
  if (image === (size === "original")) return notFound();
  const found = await getObject(`${file.storageKey}/${OBJECT_NAMES[size]}`);
  if (!found) return notFound();

  const headers = new Headers({
    "Content-Type": image ? "image/jpeg" : file.mime,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (found.length !== undefined) headers.set("Content-Length", String(found.length));
  if (!image) {
    // A PDF opens in the browser's viewer, with no script of its own (plan of 0.12).
    headers.set("Content-Security-Policy", "sandbox");
    headers.set(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
  }
  return new Response(found.body, { status: 200, headers });
}
