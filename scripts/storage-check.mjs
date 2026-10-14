// npm run storage:check, and `node scripts/storage-check.mjs` in the console of the test copy's
// component `web` (build-plan 0.15; docs/deploy.md): proves the file storage of the S3_*
// variables and sharp in the image. It makes an invented picture, makes its 160 px JPEG with
// sharp, writes it under checks/, reads it back, compares the bytes and reads the width again.
// It prints "storage ok", or one line "storage failed: …" that names a variable or an error kind,
// never a value. No screen has a photo field yet; the first task with one shows a photo on the
// test copy (plan of 0.15, decision 2, Look first). The object stays: nothing in the app reads
// checks/, and nothing is deleted (decision 8).
import { pathToFileURL } from "node:url";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { s3ClientOf, storageConfigOf } from "./ensure-bucket.mjs";

/** The width of the small version of a photo (0.12). */
export const CHECK_WIDTH = 160;

/** The bytes of an object, or null when it is not there. */
export async function readObject(client, bucket, key) {
  try {
    const found = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!found.Body) return null;
    return new Uint8Array(await found.Body.transformToByteArray());
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

/** An invented 1600 × 1200 picture of two colours, made smaller as a photo is. */
async function checkPicture() {
  const left = await sharp({
    create: { width: 800, height: 1200, channels: 3, background: { r: 10, g: 120, b: 80 } },
  })
    .png()
    .toBuffer();
  const picture = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 240, g: 200, b: 40 } },
  })
    .composite([{ input: left, left: 0, top: 0 }])
    .jpeg()
    .toBuffer();
  return new Uint8Array(await sharp(picture).resize({ width: CHECK_WIDTH }).jpeg().toBuffer());
}

/** The error's kind and HTTP status: an SDK message can name the bucket or the endpoint. */
function kindOf(error) {
  const status = error?.$metadata?.httpStatusCode;
  const name = error instanceof Error ? error.name : "Error";
  return status ? `${name} (HTTP ${status})` : name;
}

/**
 * Runs the check once.
 * @param {Record<string, string | undefined>} env where the S3_* variables are read
 * @param {Date} moment names the object (CLAUDE.md rule 10: the caller gives the time)
 * @param {{ read?: typeof readObject }} [options] `read` replaces the read-back, for the tests
 * @returns {Promise<string>} "storage ok" or "storage failed: …"
 */
export async function storageCheck(env, moment, options = {}) {
  let config;
  try {
    config = storageConfigOf(env);
  } catch (error) {
    // storageConfigOf names the variable only; its hint about the local .env is left out, as the
    // owner runs this on the test copy, where docs/deploy.md says where the variable is typed.
    const message = error instanceof Error ? error.message : String(error);
    const missing = /^(S3_[A-Z_]+) is not set\./.exec(message);
    return `storage failed: ${missing ? `${missing[1]} is not set.` : message}`;
  }
  const read = options.read ?? readObject;
  const client = s3ClientOf(config);
  const key = `checks/${moment.toISOString().replaceAll(":", "-")}.jpg`;
  try {
    const written = await checkPicture();
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: written,
        ContentType: "image/jpeg",
      }),
    );
    const back = await read(client, config.bucket, key);
    if (!back) return "storage failed: the picture written was not found when read back.";
    if (!Buffer.from(back).equals(Buffer.from(written))) {
      return "storage failed: the picture read back differs from the one written.";
    }
    const { width, format } = await sharp(back).metadata();
    if (format !== "jpeg" || width !== CHECK_WIDTH) {
      return `storage failed: the picture read back is not a ${CHECK_WIDTH} px JPEG.`;
    }
    return "storage ok";
  } catch (error) {
    return `storage failed: ${kindOf(error)}.`;
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // eslint-disable-next-line no-restricted-syntax -- the one moment of this script (rule 10)
  const line = await storageCheck(process.env, new Date());
  console.log(line);
  if (line !== "storage ok") process.exitCode = 1;
}
