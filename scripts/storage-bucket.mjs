import { ensureBucket, storageConfigOf } from "./ensure-bucket.mjs";

// `npm run storage:bucket`: the bucket of the S3_* variables of .env, made when it is missing.

const config = storageConfigOf(process.env);
const created = await ensureBucket(config);
console.log(created ? `created the bucket ${config.bucket}` : `the bucket ${config.bucket} is there`);
