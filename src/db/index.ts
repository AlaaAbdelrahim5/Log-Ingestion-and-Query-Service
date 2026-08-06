import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import { config } from "../config.js";

const migrationClient = postgres(config.db.url, { max: 1 });
await migrate(drizzle(migrationClient), config.db.migrationConfig);
await migrationClient.end();

const conn = postgres(config.db.url);
export const db = drizzle(conn, { schema });

export async function pingDb(): Promise<void> {
  await conn`SELECT 1`;
}
