import {
  pgTable,
  timestamp,
  text,
  uuid,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

export const logLevelEnum = pgEnum("log_level", [
  "debug",
  "info",
  "warn",
  "error",
]);

export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    level: logLevelEnum("level").notNull(),
    service: text("service").notNull(),
    message: text("message").notNull(),
    attributes: jsonb("attributes")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
  },
  (table) => [
    index("logs_timestamp_id_idx").on(table.timestamp.desc(), table.id.desc()),
    index("logs_service_timestamp_idx").on(
      table.service,
      table.timestamp.desc(),
    ),
  ],
);

export type NewLog = typeof logs.$inferInsert;
export type LogRow = typeof logs.$inferSelect;
