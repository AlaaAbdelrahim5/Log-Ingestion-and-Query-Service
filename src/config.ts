try {
  process.loadEnvFile();
} catch {
  // .env is optional; Docker Compose injects environment variables.
}

function envOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

function envOrDefault(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

export const config = {
  db: {
    url: envOrThrow("DB_URL"),
  },
  retention: {
    days: Number(envOrDefault("RETENTION_DAYS", "30")),
    intervalMs: Number(envOrDefault("RETENTION_INTERVAL_MS", "300000")),
    batchSize: Number(envOrDefault("RETENTION_BATCH_SIZE", "5000")),
  },
};
