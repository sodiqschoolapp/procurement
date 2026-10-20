import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { FILE_PURPOSES, MAX_FILE_BYTES, allowedFor, sniffMime, storedName } from "@/domain/files";
import { uploadFile } from "@/features/files/actions/upload-file";
import {
  UPLOAD_STATUS,
  type UploadFailureCode,
  type UploadResult,
  uploadFailure,
} from "@/features/files/upload-result";
import { runAction } from "@/server/action";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize } from "@/server/authorize";
import { NotAnImage, objectsOf } from "@/server/files/process";
import { putObject } from "@/server/storage";

// The upload route, POST /files (build plan 0.12; plan of 0.12, decision 10). A multipart form
// with `file`, `purpose` (`photo` or `document`) and `clientKey`. Outside the proxy (decision 7):
// a signed-out visitor gets 401 here, and the body is read by this route alone, which stops at
// the limit. The type is read from the content, never the name (developer-rules.md rule 13). The
// objects are written first, then the row through the action wrapper (decision 15).

// A multipart form carries its boundaries and field headers beside the file: room for them, and
// no more, before the reading stops.
const FORM_ROOM = 64 * 1024;

const fields = z.object({
  purpose: z.enum(FILE_PURPOSES),
  clientKey: z.string().refine(isClientKey),
});

function answer(result: UploadResult, status = 201): Response {
  return Response.json(result, { status: result.ok ? status : UPLOAD_STATUS[result.error.code] });
}

const refuse = (code: UploadFailureCode) => answer(uploadFailure(code));

/** The body, or `null` once it passes `limit` bytes: the rest is never read. */
async function readBody(
  request: NextRequest,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return refuse("signed_out");
  try {
    // Before a byte of the body is read (developer-rules.md rule 4).
    await authorize(user.id, "file.upload");
  } catch (error) {
    if (error instanceof AuthorizationError) return refuse(error.kind);
    throw error;
  }

  const limit = MAX_FILE_BYTES + FORM_ROOM;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return refuse("too_large");
  const body = await readBody(request, limit);
  if (!body) return refuse("too_large");

  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return refuse("invalid_input");
  }
  const file = form.get("file");
  const parsed = fields.safeParse({
    purpose: form.get("purpose"),
    clientKey: form.get("clientKey"),
  });
  if (!(file instanceof File) || !parsed.success) return refuse("invalid_input");
  if (file.size > MAX_FILE_BYTES) return refuse("too_large");
  if (file.size === 0) return refuse("not_an_allowed_type");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes.subarray(0, 16));
  if (!mime || !allowedFor(parsed.data.purpose, mime)) return refuse("not_an_allowed_type");

  let objects: Awaited<ReturnType<typeof objectsOf>>;
  try {
    objects = await objectsOf(bytes, mime, parsed.data.purpose);
  } catch (error) {
    if (error instanceof NotAnImage) return refuse("not_an_image");
    throw error;
  }

  const storageKey = randomUUID();
  await Promise.all(
    objects.map((object) =>
      putObject(`${storageKey}/${object.name}`, object.body, object.contentType),
    ),
  );

  const result = await runAction(uploadFile, user.id, {
    clientKey: parsed.data.clientKey,
    storageKey,
    originalName: storedName(file.name),
    mime,
    sizeBytes: file.size,
  });
  if (!result.ok) return refuse(result.error.code === "network" ? "unexpected" : result.error.code);
  return answer(result);
}
