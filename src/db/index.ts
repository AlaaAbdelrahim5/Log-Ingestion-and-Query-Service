import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import { config } from "../config.js";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrateWithRetry(): Promise<void> {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const migrationClient = postgres(config.db.url, {
      max: 1,
      connect_timeout: 5,
    });

    try {
      await migrate(drizzle(migrationClient), config.db.migrationConfig);
      await migrationClient.end();
      console.log("Database connected and migrations applied");
      return;
    } catch (err) {
      await migrationClient.end({ timeout: 1 }).catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Database init failed (attempt ${attempt}/${maxAttempts}): ${message}`,
      );
      if (attempt === maxAttempts) {
        throw err;
      }
      await sleep(1000);
    }
  }
}

await migrateWithRetry();

const conn = postgres(config.db.url, {
  max: 8,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(conn, { schema });

export async function pingDb(): Promise<void> {
  await conn`SELECT 1`;
}
