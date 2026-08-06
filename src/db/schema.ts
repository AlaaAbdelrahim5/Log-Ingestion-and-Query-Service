import { pgTable, timestamp, text, uuid, jsonb } from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";

export const logLevelEnum = pgEnum("log_level", [
  "debug",
  "info",
  "warn",
  "error",
]);

export const logs = pgTable("logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  level: logLevelEnum("level").notNull(),
  service: text("service").notNull(),
  message: text("message").notNull(),
  attributes:
    jsonb("attributes").$type<Record<string, string | number | boolean>>(),
});

export type NewLog = typeof logs.$inferInsert;
