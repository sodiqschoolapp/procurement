import { backupStorageConfigOf, ensureBucket, storageConfigOf } from "./ensure-bucket.mjs";

// `npm run storage:bucket`: the bucket of the S3_* variables of .env, and the bucket of the weekly
// copies of the BACKUP_S3_* variables when BACKUP_S3_BUCKET is set (build-plan 8.2b), each made
// when it is missing.

const configs = [storageConfigOf(process.env)];
if (process.env.BACKUP_S3_BUCKET) configs.push(backupStorageConfigOf(process.env));
else console.log("BACKUP_S3_BUCKET is not set: no bucket for the copies of the database");
for (const config of configs) {
  const created = await ensureBucket(config);
  console.log(
    created ? `created the bucket ${config.bucket}` : `the bucket ${config.bucket} is there`,
  );
}
