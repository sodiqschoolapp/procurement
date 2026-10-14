import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { now } from "@/server/clock";
import { connectionOptions } from "@/server/db/connection-options.mjs";
import * as schema from "@/server/db/schema";
import { users } from "@/server/db/schema";

import { authSecret } from "./secret";
import { SESSION_SECONDS } from "./session-cookie";

// The login library (13-technology.md, Login: "Better Auth with its username plugin: username
// and password, sessions in the database, public sign-up off"). Configured once, here.
//
// It is created lazily, on the first sign-in, never at import: `next build`, /health and a page
// without a session cookie never start it (plan of 0.6, decision 18). No HTTP route of the
// library is mounted (D5: no REST API); src/server/auth/sign-in.ts calls its server API.
// Our own reader (session.ts) judges sessions; the library's getSession is never used, because
// it reads its own clock (plan of 0.6, decision 7).
//
// The library has a small pool of its own. signIn() holds a connection of the app's pool for
// its transaction while the library writes the session; on the same pool, ten sign-ins at once
// would each hold one connection and wait for a second for ever (review of the plan of 0.6,
// correction 3). Nothing on this pool ever waits for the app's pool, so no cycle exists.

const LIBRARY_POOL_SIZE = 4;

function createAuth(secret: string) {
  const address = process.env.DATABASE_URL;
  if (!address) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({
    ...connectionOptions(address, process.env.DATABASE_CA_CERT),
    max: LIBRARY_POOL_SIZE,
    options: "-c timezone=UTC",
  });
  const libraryDb = drizzle({ client: pool, schema });

  const auth = betterAuth({
    secret,
    telemetry: { enabled: false },
    database: drizzleAdapter(libraryDb, {
      provider: "pg",
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    user: {
      modelName: "users",
      fields: { name: "fullName" },
      // Our own columns of the users table (14-data-model.md). The library never writes a user
      // (sign-up is off), and nothing a browser sends can set them (`input: false`).
      additionalFields: {
        phone: { type: "string", required: true, input: false },
        role: { type: "string", required: true, input: false },
        locale: { type: "string", required: false, input: false },
        isActive: { type: "boolean", required: false, input: false },
        lastLoginAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      modelName: "sessions",
      // 24 hours from sign-in, never extended (A8; plan of 0.6, decision 7).
      expiresIn: SESSION_SECONDS,
      disableSessionRefresh: true,
    },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    emailAndPassword: {
      enabled: true,
      // Accounts are made by the Head only (13-technology.md, Login; A8).
      disableSignUp: true,
      // No password rules (A8): any password that is not empty; 4096 only guards the size
      // (plan of 0.6, decision 12).
      minPasswordLength: 1,
      maxPasswordLength: 4096,
    },
    // The library's limiter counts per address, and only on its HTTP route, which does not
    // exist here; our limit is per username (src/domain/sign-in-limit.ts).
    rateLimit: { enabled: false },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "procurement",
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    databaseHooks: {
      session: {
        create: {
          // Our clock writes the session's times (CLAUDE.md rule 10), and an inactive user
          // gets no session: the backstop of the check in signIn().
          async before(session) {
            const [owner] = await libraryDb
              .select({ isActive: users.isActive })
              .from(users)
              .where(eq(users.id, session.userId));
            if (!owner?.isActive) return false;
            const createdAt = now();
            return {
              data: {
                ...session,
                createdAt,
                updatedAt: createdAt,
                expiresAt: new Date(createdAt.getTime() + SESSION_SECONDS * 1000),
              },
            };
          },
        },
      },
    },
    plugins: [username()],
  });
  return { auth, pool };
}

type Created = ReturnType<typeof createAuth>;

const kept = globalThis as typeof globalThis & { procurementAuth?: Created };

/**
 * The library instance, made on first use. Refuses in production when `BETTER_AUTH_SECRET` is
 * not set (review of the plan of 0.6, correction 1), so sign-in is refused and nothing else.
 */
export function getAuth(): Created["auth"] {
  if (!kept.procurementAuth) {
    const secret = authSecret();
    if (!secret) {
      throw new Error("BETTER_AUTH_SECRET is not set: sign-in is refused (docs/deploy.md).");
    }
    kept.procurementAuth = createAuth(secret);
  }
  return kept.procurementAuth.auth;
}

/** Closes the library's pool. For tests and scripts that must end; the app never calls it. */
export async function closeAuth(): Promise<void> {
  const created = kept.procurementAuth;
  delete kept.procurementAuth;
  if (created) await created.pool.end();
}
