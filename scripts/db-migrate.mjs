// npm run db:migrate: applies the SQL migrations of drizzle/ to the database in DATABASE_URL.
// It prints where it works and what it applied, and never the address or a password.
import { applyMigrations, describeDatabase, failureReason } from "./apply-migrations.mjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").');
  process.exit(1);
}

try {
  console.log(`Migrating ${describeDatabase(connectionString)}`);
  const applied = await applyMigrations(connectionString);
  if (applied.length === 0) {
    console.log("nothing to apply");
  } else {
    for (const name of applied) console.log(`applied ${name}`);
  }
} catch (error) {
  console.error(`db:migrate failed: ${failureReason(error)}`);
  process.exit(1);
}
