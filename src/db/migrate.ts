import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { config } from "../config.js";

const MIGRATIONS_DIR = "./src/db/migrations";

export async function runMigrations(): Promise<void> {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const migrationClient = postgres(config.db.url, {
      max: 1,
      connect_timeout: 5,
      prepare: false,
      onnotice: () => undefined,
    });

    try {
      await applyMigrations(migrationClient);
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

async function applyMigrations(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (
      await sql<{ id: string }[]>`
        SELECT id FROM schema_migrations
      `
    ).map((row) => row.id),
  );

  const tables = await sql<{ logs: string | null }[]>`
    SELECT to_regclass('public.logs')::text AS logs
  `;
  const schemaReady = Boolean(tables[0]?.logs);

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    if (schemaReady) {
      await sql`
        INSERT INTO schema_migrations (id) VALUES (${file})
        ON CONFLICT DO NOTHING
      `;
      continue;
    }

    const text = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = text
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx`INSERT INTO schema_migrations (id) VALUES (${file})`;
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
