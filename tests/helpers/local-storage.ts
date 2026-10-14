// The file storage of docker-compose.yml, for the tests and the e2e server (review of the plan of
// 0.12, correction 1): CI sets only DATABASE_URL, so the S3_* values come from here when the
// environment has none. The keys are the invented, public ones of the compose file (plan of 0.12,
// decision 14). Each test layer has its own bucket, so no test reads the developer's files.

const LOCAL = {
  S3_ENDPOINT: "http://127.0.0.1:8333",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "procurement-local",
  S3_SECRET_ACCESS_KEY: "procurement-local-secret",
};

/** The S3_* variables of a test layer: the environment's own, or the local ones. */
export function testStorageEnv(
  bucket: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const names = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ] as const;
  const result: Record<string, string> = { S3_BUCKET: bucket };
  for (const name of names) result[name] = env[name] || LOCAL[name];
  return result;
}

/** The bucket of the Vitest database tests. */
export const TEST_BUCKET = "procurement-test";
/** The bucket of the Playwright server. */
export const E2E_BUCKET = "procurement-e2e";
