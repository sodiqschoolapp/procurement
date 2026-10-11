import { defineConfig } from "drizzle-kit";

// Used by `npx drizzle-kit generate --name <name>` only: it writes the next SQL migration from
// the schema files. It holds no database address, because writing a migration file needs none.
// `drizzle-kit push` is never used: it changes a database without a migration file.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
});
