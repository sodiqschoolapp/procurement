import pg from "pg";
import { describe, expect, it } from "vitest";

import { connectionOptions } from "./connection-options.mjs";

// build-plan 0.16 and its plan, decision 5: the managed database's certificate is verified with
// the CA certificate of DATABASE_CA_CERT; verification is never switched off. The address and
// the certificate below are invented.

const LOCAL = "postgres://procurement@127.0.0.1:5433/procurement";
const MANAGED =
  "postgresql://app_user:invented-password@db-invented.example.com:25060/app_db?sslmode=require";
const CA = "-----BEGIN CERTIFICATE-----\ninvented\n-----END CERTIFICATE-----\n";

describe("the connection options (build-plan 0.16, plan decision 5)", () => {
  it("leaves the address as it is and sets no TLS without a CA certificate", () => {
    expect(connectionOptions(LOCAL, undefined)).toEqual({ connectionString: LOCAL });
    expect(connectionOptions(LOCAL, "")).toEqual({ connectionString: LOCAL });
  });

  it("verifies the server against the CA certificate and drops the address's own TLS settings", () => {
    const options = connectionOptions(`${MANAGED}&sslrootcert=/x.crt&uselibpqcompat=true`, CA);

    expect(options.ssl).toEqual({ ca: CA, rejectUnauthorized: true });
    const address = new URL(options.connectionString);
    expect(address.searchParams.has("sslmode")).toBe(false);
    expect(address.searchParams.has("sslrootcert")).toBe(false);
    expect(address.searchParams.has("uselibpqcompat")).toBe(false);
    expect(address.hostname).toBe("db-invented.example.com");
    expect(address.port).toBe("25060");
    expect(address.pathname).toBe("/app_db");
    expect(address.username).toBe("app_user");
  });

  it("reaches the driver as a verified TLS connection, not as the address's sslmode", () => {
    const client = new pg.Client(connectionOptions(MANAGED, CA));

    expect(client.ssl as unknown).toEqual({ ca: CA, rejectUnauthorized: true });
  });

  it("keeps the other settings of the address", () => {
    const options = connectionOptions(`${MANAGED}&application_name=ombor`, CA);

    expect(new URL(options.connectionString).searchParams.get("application_name")).toBe("ombor");
  });

  it("refuses an address that is not one, without repeating it (CLAUDE.md, secrets convention)", () => {
    const failure = (() => {
      try {
        connectionOptions("not an address invented-password", CA);
      } catch (error) {
        return error as Error;
      }
    })();

    expect(failure?.message).toContain("DATABASE_URL");
    expect(failure?.message).not.toContain("invented-password");
  });
});
