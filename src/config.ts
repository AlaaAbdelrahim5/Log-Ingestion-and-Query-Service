import { Config } from "./utils/types.js";

try {
  process.loadEnvFile();
} catch {
  // .env is optional; Docker Compose injects environment variables.
}

export function envOrThrow(key: string): string {
  const value = process.env[key];

  if (!value) throw new Error(`Missing environment variable: ${key}`);

  return value;
}

export function envOrDefault(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

export const config: Config = {
  api: {
    platform: envOrDefault("PLATFORM", "dev"),
  },
  db: {
    url: envOrThrow("DB_URL"),
    migrationConfig: {
      migrationsFolder: "./src/db/migrations",
    },
  },
  retention: {
    days: Number(envOrDefault("RETENTION_DAYS", "30")),
    intervalMs: Number(envOrDefault("RETENTION_INTERVAL_MS", "60000")),
    batchSize: Number(envOrDefault("RETENTION_BATCH_SIZE", "5000")),
  },
};
