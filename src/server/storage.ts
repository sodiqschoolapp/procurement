import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

import { s3ClientOf, storageConfigOf } from "../../scripts/ensure-bucket.mjs";

// The one file storage client of the app (13-technology.md, Files): SeaweedFS on this machine
// and in CI, Cloudflare R2 in the cloud, both through the S3 API (plan of 0.12, decision 1). The
// bucket is private, and nothing here makes a public or a signed address: every byte a browser
// gets goes through the download route, which checks access first.
//
// The client is made on first use, not at import: the app starts, and /health and /login answer,
// with no S3_* variable set (review of the plan of 0.12, correction 2); a missing one fails the
// upload or download that needs it.

type Storage = { client: S3Client; bucket: string };

const kept = globalThis as typeof globalThis & { procurementStorage?: Storage };

function storage(): Storage {
  if (!kept.procurementStorage) {
    const config = storageConfigOf(process.env);
    kept.procurementStorage = { client: s3ClientOf(config), bucket: config.bucket };
  }
  return kept.procurementStorage;
}

/** Writes one object. */
export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/** Reads one object as a stream for a response, or `null` when it is not there. */
export async function getObject(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array>; length: number | undefined } | null> {
  const { client, bucket } = storage();
  try {
    const found = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!found.Body) return null;
    return { body: found.Body.transformToWebStream(), length: found.ContentLength };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

/** Forgets the client, for tests that change the S3_* variables. */
export function resetStorage(): void {
  kept.procurementStorage?.client.destroy();
  delete kept.procurementStorage;
}
