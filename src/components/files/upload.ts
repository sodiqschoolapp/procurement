import type { ClientKey } from "@/components/client-key";
import {
  type FilePurpose,
  SHRINK_QUALITY,
  isImageMime,
  shrinkTarget,
  sniffMime,
} from "@/domain/files";
import { type UploadResult, uploadFailure } from "@/features/files/upload-result";

// The browser's side of an upload (build plan 0.12). A large photo is redrawn smaller before it is
// sent (edge-cases/system.md: "A phone photo is very large. It is shrunk in the browser before
// upload"; plan of 0.12, decision 12); the server checks everything again. The first screen with a
// photo or receipt field uses it and brings its Playwright test (plan of 0.12, Left out).

/**
 * The photo to send: redrawn as a JPEG of at most 2400 px when it is large, else as it is. A file
 * the browser cannot draw (a HEIC outside Safari, a PDF) is sent as it is.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  const mime = sniffMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!mime || !isImageMime(mime)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const target = shrinkTarget(bitmap.width, bitmap.height, file.size);
    if (!target) return file;
    const canvas = new OffscreenCanvas(target.width, target.height);
    const context = canvas.getContext("2d");
    if (!context) return file;
    // A transparent PNG turns white, as on the server.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: SHRINK_QUALITY });
    // A redrawn photo that came out larger than the original is not sent.
    if (blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/** Sends a file to the upload route. The same client key on every try (developer-rules rule 8). */
export async function uploadFile(
  file: File,
  purpose: FilePurpose,
  clientKey: ClientKey,
): Promise<UploadResult> {
  const sent = await shrinkPhoto(file);
  const form = new FormData();
  form.set("file", sent);
  form.set("purpose", purpose);
  form.set("clientKey", clientKey);
  try {
    const response = await fetch("/files", { method: "POST", body: form });
    return (await response.json()) as UploadResult;
  } catch {
    return uploadFailure("network");
  }
}
