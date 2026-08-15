import { aggregateLogs } from "../db/logs.js";
import { AggregateLogsResult } from "../types.js";
import { parseAggregateQuery } from "../validation/parse-query.js";

export async function aggregateLogsService(
  query: Record<string, unknown>,
): Promise<AggregateLogsResult> {
  const filters = parseAggregateQuery(query);
  const rows = await aggregateLogs(filters);

  return {
    buckets: rows.map((row) => {
      const record = row as {
        start: Date | string;
        group?: string | null;
        count: number;
      };
      return {
        start: formatBucketStart(toDate(record.start)),
        group: record.group ?? null,
        count: Number(record.count),
      };
    }),
  };
}

function formatBucketStart(date: Date): string {
  return date.toISOString().replace(/\.000Z$/, "Z");
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
