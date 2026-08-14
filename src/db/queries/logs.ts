import { and, asc, count, desc, eq, gte, ilike, lt, sql, SQL } from "drizzle-orm";
import {
  AggregateQueryFilters,
  BucketSize,
  LogQueryFilters,
} from "../../utils/types.js";
import { db } from "../index.js";
import { logs, NewLog } from "../schema.js";

const BUCKET_SECONDS: Record<BucketSize, number> = {
  "1m": 60,
  "5m": 300,
  "1h": 3600,
  "1d": 86400,
};

export async function insertLogs(entries: NewLog[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  await db.insert(logs).values(entries);
}

export async function deleteExpiredLogs(
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  const limit = Math.max(1, Math.floor(Number(batchSize)));

  const result = await db.execute(sql`
    WITH doomed AS (
      SELECT id
      FROM logs
      WHERE timestamp < ${cutoff.toISOString()}::timestamptz
      LIMIT ${sql.raw(String(limit))}
    )
    DELETE FROM logs
    USING doomed
    WHERE logs.id = doomed.id
    RETURNING logs.id
  `);

  return result.length;
}

export async function queryLogs(filters: LogQueryFilters) {
  const conditions = buildLogConditions(filters);

  return db
    .select()
    .from(logs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(logs.timestamp), desc(logs.id))
    .limit(filters.limit + 1);
}

export async function aggregateLogs(filters: AggregateQueryFilters) {
  const conditions = buildLogConditions(filters);
  const seconds = BUCKET_SECONDS[filters.bucket];
  const bucketStart = sql<Date>`to_timestamp(
    floor(extract(epoch from ${logs.timestamp}) / ${sql.raw(String(seconds))}::double precision)
    * ${sql.raw(String(seconds))}::double precision
  )`.as("bucket_start");

  if (filters.groupBy === "service") {
    return db
      .select({
        start: bucketStart,
        group: logs.service,
        count: count(),
      })
      .from(logs)
      .where(and(...conditions))
      .groupBy(sql`bucket_start`, logs.service)
      .orderBy(sql`bucket_start asc`, asc(logs.service));
  }

  if (filters.groupBy === "level") {
    return db
      .select({
        start: bucketStart,
        group: logs.level,
        count: count(),
      })
      .from(logs)
      .where(and(...conditions))
      .groupBy(sql`bucket_start`, logs.level)
      .orderBy(sql`bucket_start asc`, asc(logs.level));
  }

  return db
    .select({
      start: bucketStart,
      group: sql<string | null>`cast(null as text)`,
      count: count(),
    })
    .from(logs)
    .where(and(...conditions))
    .groupBy(sql`bucket_start`)
    .orderBy(sql`bucket_start asc`);
}

function buildLogConditions(filters: {
  service?: string;
  level?: string;
  since?: Date;
  until?: Date;
  attributes: Record<string, string>;
  q?: string;
  cursor?: { timestamp: Date; id: string };
}): SQL[] {
  const conditions: SQL[] = [];

  if (filters.service !== undefined) {
    conditions.push(eq(logs.service, filters.service));
  }

  if (filters.level !== undefined) {
    conditions.push(
      eq(logs.level, filters.level as (typeof logs.level.enumValues)[number]),
    );
  }

  if (filters.since) {
    conditions.push(gte(logs.timestamp, filters.since));
  }

  if (filters.until) {
    conditions.push(lt(logs.timestamp, filters.until));
  }

  if (filters.q !== undefined) {
    conditions.push(ilike(logs.message, `%${escapeLike(filters.q)}%`));
  }

  for (const [key, value] of Object.entries(filters.attributes)) {
    conditions.push(sql`(${logs.attributes} ->> ${key}) = ${value}`);
  }

  if (filters.cursor) {
    conditions.push(
      sql`(${logs.timestamp} < ${filters.cursor.timestamp} OR (${logs.timestamp} = ${filters.cursor.timestamp} AND ${logs.id} < ${filters.cursor.id}))`,
    );
  }

  return conditions;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
