import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { s3ClientOf, storageConfigOf } from "../scripts/ensure-bucket.mjs";
import { storageCheck } from "../scripts/storage-check.mjs";
import { TEST_BUCKET, testStorageEnv } from "./helpers/local-storage";

// build-plan 0.15 ("a photo uploaded there is shown again"); 13-technology.md, Files (S3 storage,
// sharp for resizing); plan of 0.15, decision 2 (Look first): the storage check the owner runs in
// the console of the test copy makes a 160 px JPEG with sharp, writes it, reads it back and
// compares it. Here it runs against the local SeaweedFS bucket of the tests, made by the global
// setup. No message may hold the endpoint or a key (CLAUDE.md, secrets convention).

const ENV = testStorageEnv(TEST_BUCKET);
const MOMENT = new Date("2031-04-02T05:00:00Z");

function holdsNoValue(line: string): void {
  expect(line).not.toContain(ENV.S3_ENDPOINT);
  expect(line).not.toContain(ENV.S3_ACCESS_KEY_ID);
  expect(line).not.toContain(ENV.S3_SECRET_ACCESS_KEY);
}

describe("the storage check (build-plan 0.15; 13-technology.md, Files)", () => {
  it("writes a 160 px JPEG made by sharp, reads it back and says storage ok", async () => {
    expect(await storageCheck(ENV, MOMENT)).toBe("storage ok");
  });

  it("says when the picture is not found when read back (a key never written)", async () => {
    const line = await storageCheck(ENV, new Date("2031-04-02T05:01:00Z"), {
      read: async (client, bucket, key) => {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        try {
          await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${key}.never-written` }));
          return new Uint8Array();
        } catch (error) {
          if (
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
          ) {
            return null;
          }
          throw error;
        }
      },
    });

    expect(line).toBe("storage failed: the picture written was not found when read back.");
    holdsNoValue(line);
  });

  it("says when the picture read back differs (the object overwritten before the read)", async () => {
    const client = s3ClientOf(storageConfigOf(ENV));
    try {
      const line = await storageCheck(ENV, new Date("2031-04-02T05:02:00Z"), {
        read: async (checkClient, bucket, key) => {
          await client.send(
            new PutObjectCommand({ Bucket: bucket, Key: key, Body: new Uint8Array([1, 2, 3]) }),
          );
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const found = await checkClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          return new Uint8Array(await found.Body!.transformToByteArray());
        },
      });

      expect(line).toBe("storage failed: the picture read back differs from the one written.");
      holdsNoValue(line);
    } finally {
      client.destroy();
    }
  });

  it("names a missing variable, never a value", async () => {
    const rest: Record<string, string> = { ...ENV };
    delete rest.S3_SECRET_ACCESS_KEY;
    const line = await storageCheck(rest, MOMENT);

    expect(line).toBe(
      'storage failed: S3_SECRET_ACCESS_KEY is not set. Put it into the local .env file (README.md, "Run it").',
    );
    holdsNoValue(line);
  });

  it("names the kind of a storage error, not the endpoint or a key (a wrong secret)", async () => {
    const wrong = "invented-wrong-secret";
    const line = await storageCheck({ ...ENV, S3_SECRET_ACCESS_KEY: wrong }, MOMENT);

    expect(line).toMatch(/^storage failed: \w+ \(HTTP 403\)\.$/);
    expect(line).not.toContain(wrong);
    holdsNoValue(line);
  });
});
