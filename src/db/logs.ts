import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AggregateQueryFilters,
  BucketSize,
  LogQueryFilters,
  LogRow,
  NewLog,
} from "../types.js";
import { ingestSql, sql } from "./client.js";

const BUCKET_INTERVAL: Record<BucketSize, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "1h": "1 hour",
  "1d": "1 day",
};

const MAX_FLUSH_ROWS = 8000;
const GATHER_MS = 4;

type InsertWaiter = {
  entries: NewLog[];
  resolve: () => void;
  reject: (err: unknown) => void;
};

const insertQueue: InsertWaiter[] = [];
let flushing = false;

export function insertLogs(entries: NewLog[]): Promise<void> {
  if (entries.length === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    insertQueue.push({ entries, resolve, reject });
    void flushInsertQueue();
  });
}

async function flushInsertQueue(): Promise<void> {
  if (flushing) {
    return;
  }
  flushing = true;

  try {
    while (insertQueue.length > 0) {
      const queuedRows = insertQueue.reduce(
        (sum, waiter) => sum + waiter.entries.length,
        0,
      );
      if (queuedRows < 4000) {
        await sleep(GATHER_MS);
      }

      const batch: InsertWaiter[] = [];
      let rows = 0;
      while (insertQueue.length > 0 && rows < MAX_FLUSH_ROWS) {
        const next = insertQueue[0];
        if (
          batch.length > 0 &&
          rows + next.entries.length > MAX_FLUSH_ROWS
        ) {
          break;
        }
        insertQueue.shift();
        batch.push(next);
        rows += next.entries.length;
      }

      try {
        await insertNow(batch.flatMap((waiter) => waiter.entries));
        for (const waiter of batch) {
          waiter.resolve();
        }
      } catch (err) {
        for (const waiter of batch) {
          waiter.reject(err);
        }
      }
    }
  } finally {
    flushing = false;
    if (insertQueue.length > 0) {
      void flushInsertQueue();
    }
  }
}

async function insertNow(entries: NewLog[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const payload = toCopyText(entries);
  const writable = await ingestSql`
    COPY logs (timestamp, level, service, message, attributes) FROM STDIN
  `.writable();
  await pipeline(Readable.from([payload]), writable);
}

function toCopyText(entries: NewLog[]): string {
  const lines = new Array<string>(entries.length);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    lines[i] =
      escapeCopy(entry.timestamp) +
      "\t" +
      entry.level +
      "\t" +
      escapeCopy(entry.service) +
      "\t" +
      escapeCopy(entry.message) +
      "\t" +
      escapeCopy(entry.attributesJson);
  }
  return lines.join("\n") + "\n";
}

function escapeCopy(value: string): string {
  if (
    !value.includes("\\") &&
    !value.includes("\t") &&
    !value.includes("\n") &&
    !value.includes("\r")
  ) {
    return value;
  }
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

export async function queryLogs(filters: LogQueryFilters): Promise<LogRow[]> {
  const where = buildWhere(filters);
  const limit = Math.max(1, Math.min(filters.limit + 1, 1001));

  return sql<LogRow[]>`
    SELECT
      id::text AS id,
      timestamp,
      level::text AS level,
      service,
      message,
      COALESCE(attributes, '{}'::jsonb) AS attributes
    FROM logs
    WHERE ${where}
    ORDER BY timestamp DESC, id DESC
    LIMIT ${sql.unsafe(String(limit))}
  `;
}

export async function aggregateLogs(filters: AggregateQueryFilters) {
  const where = buildWhere(filters);
  const interval = BUCKET_INTERVAL[filters.bucket];
  const bucketSql = sql`date_bin(${interval}::interval, timestamp, TIMESTAMPTZ 'epoch')`;

  if (filters.groupBy === "service") {
    return sql<{ start: Date; group: string | null; count: number }[]>`
      SELECT ${bucketSql} AS start, service AS "group", count(*)::int AS count
      FROM logs
      WHERE ${where}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;
  }

  if (filters.groupBy === "level") {
    return sql<{ start: Date; group: string | null; count: number }[]>`
      SELECT ${bucketSql} AS start, level::text AS "group", count(*)::int AS count
      FROM logs
      WHERE ${where}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;
  }

  return sql<{ start: Date; group: string | null; count: number }[]>`
    SELECT ${bucketSql} AS start, NULL::text AS "group", count(*)::int AS count
    FROM logs
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1
  `;
}

export async function deleteExpiredLogs(
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  const limit = Math.max(1, Math.floor(Number(batchSize)));

  const result = await sql`
    WITH doomed AS (
      SELECT id
      FROM logs
      WHERE timestamp < ${cutoff.toISOString()}::timestamptz
      ORDER BY timestamp, id
      LIMIT ${sql.unsafe(String(limit))}
    )
    DELETE FROM logs
    USING doomed
    WHERE logs.id = doomed.id
    RETURNING logs.id
  `;

  return result.length;
}

function buildWhere(filters: {
  service?: string;
  level?: string;
  since?: Date;
  until?: Date;
  attributes: Record<string, string>;
  q?: string;
  cursor?: { timestamp: Date; id: string };
}) {
  const clauses = [sql`TRUE`];

  if (filters.service !== undefined) {
    clauses.push(sql`service = ${filters.service}`);
  }

  if (filters.level !== undefined) {
    clauses.push(sql`level = ${filters.level}::log_level`);
  }

  if (filters.since) {
    clauses.push(sql`timestamp >= ${filters.since.toISOString()}::timestamptz`);
  }

  if (filters.until) {
    clauses.push(sql`timestamp < ${filters.until.toISOString()}::timestamptz`);
  }

  if (filters.q !== undefined) {
    clauses.push(
      sql`message ILIKE ${"%" + escapeLike(filters.q) + "%"} ESCAPE '\\'`,
    );
  }

  for (const [key, value] of Object.entries(filters.attributes)) {
    clauses.push(sql`(attributes ->> ${key}) = ${value}`);
  }

  if (filters.cursor) {
    const cursorTs = filters.cursor.timestamp.toISOString();
    clauses.push(sql`(
      timestamp < ${cursorTs}::timestamptz
      OR (
        timestamp = ${cursorTs}::timestamptz
        AND id < ${filters.cursor.id}::bigint
      )
    )`);
  }

  return clauses.reduce((left, right) => sql`${left} AND ${right}`);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
