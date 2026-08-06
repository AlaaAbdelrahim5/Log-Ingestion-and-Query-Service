import { Config } from "./utils/types.js";

process.loadEnvFile();

export function envOrThrow(key: string): string {
  const value = process.env[key];

  if (!value) throw new Error(`Missing environment variable: ${key}`);

  return value;
}

export const config: Config = {
  api: {
    // fileserverHits: 0,
    platform: envOrThrow("PLATFORM"),
    //     jwtSecret: envOrThrow("JWT_SECRET"),
    //     polkaKey: envOrThrow("POLKA_KEY"),
  },
  db: {
    url: envOrThrow("DB_URL"),
    migrationConfig: {
      migrationsFolder: "./src/db/migrations",
    },
  },
};
