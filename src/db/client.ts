import postgres from "postgres";
import { config } from "../config.js";
import { runMigrations } from "./migrate.js";

await runMigrations();

const clientOptions = {
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
  onnotice: () => undefined,
  connection: {
    application_name: "log-ingest",
  },
} as const;

export const ingestSql = postgres(config.db.url, {
  ...clientOptions,
  max: 1,
});

export const sql = postgres(config.db.url, {
  ...clientOptions,
  max: 6,
  connection: {
    application_name: "log-query",
    statement_timeout: 20000,
  },
});

export async function pingDb(): Promise<void> {
  await sql`SELECT 1`;
}
