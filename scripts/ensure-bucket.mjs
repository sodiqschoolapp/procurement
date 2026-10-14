import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

// Creates the private bucket of file storage when it is missing (plan of 0.12, decision 13).
// Used by `npm run storage:bucket` and by the test setups, never by the running app; the bucket
// of the test copy and of production is made by the owner in the R2 dashboard (task 0.15).
// A bucket made through the S3 API is private: nothing is readable without the keys.

/** The five S3_* variables, each required. The message names a variable, never a value. */
export function storageConfigOf(env) {
  const names = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ];
  for (const name of names) {
    if (!env[name]) {
      throw new Error(`${name} is not set. Put it into the local .env file (README.md, "Run it").`);
    }
  }
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
}

/** An S3 client for SeaweedFS on this machine or R2 in the cloud: the same code for both. */
export function s3ClientOf(config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    // Addresses as <endpoint>/<bucket>/<key>: SeaweedFS needs it, and R2 accepts it.
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

/** Creates the bucket unless it is there. Returns whether it was created. */
export async function ensureBucket(config) {
  const client = s3ClientOf(config);
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return false;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 404) throw error;
    }
    await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    return true;
  } finally {
    client.destroy();
  }
}
