import { aggregateLogs } from "../db/queries/logs.js";
import { AggregateLogsResult } from "../utils/types.js";
import { parseAggregateQuery } from "../validation/parse-query.js";

export async function aggregateLogsService(
  query: Record<string, unknown>,
): Promise<AggregateLogsResult> {
  const filters = parseAggregateQuery(query);
  const rows = await aggregateLogs(filters);

  return {
    buckets: rows.map((row) => ({
      start: formatBucketStart(toDate(row.start)),
      group: row.group ?? null,
      count: Number(row.count),
    })),
  };
}

function formatBucketStart(date: Date): string {
  return date.toISOString().replace(/\.000Z$/, "Z");
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
