// How every connection to PostgreSQL is opened: the app's pool (client.ts) and `db:migrate`
// (scripts/apply-migrations.mjs) both take their options from here, so the two never differ.
// Plain .mjs: the container runs the migration script with production packages only (0.16).

// The settings of the address that would decide TLS for the driver and override `ssl` below.
const TLS_SETTINGS_OF_THE_ADDRESS = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "uselibpqcompat",
];

/**
 * The connection options for one database address.
 *
 * Without a CA certificate (laptop, CI, cloud session) the address is used as it is.
 * With one (the database on DigitalOcean, `DATABASE_CA_CERT`), the server's certificate is
 * verified against it: the address's own TLS settings are taken out, because the driver reads
 * `sslmode=require` as `verify-full` without a CA and would refuse DigitalOcean's certificate.
 * Verification is never switched off.
 * @param {string} connectionString
 * @param {string | undefined} caCertificate
 * @returns {{ connectionString: string, ssl?: { ca: string, rejectUnauthorized: true } }}
 */
export function connectionOptions(connectionString, caCertificate) {
  if (!caCertificate) return { connectionString };

  // The error of `new URL` can repeat the whole text, password included. This one does not.
  if (!URL.canParse(connectionString)) {
    throw new Error("DATABASE_URL is not a valid database address.");
  }
  const address = new URL(connectionString);
  for (const name of TLS_SETTINGS_OF_THE_ADDRESS) address.searchParams.delete(name);
  return {
    connectionString: address.toString(),
    ssl: { ca: caCertificate, rejectUnauthorized: true },
  };
}
