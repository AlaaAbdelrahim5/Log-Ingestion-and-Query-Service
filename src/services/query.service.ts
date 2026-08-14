import { aggregateLogs, queryLogs } from "../db/queries/logs.js";
import {
  encodeCursor,
  parseAggregateQuery,
  parseLogQuery,
} from "../utils/parse-query.js";
import { LogResponse, QueryLogsResult, AggregateLogsResult } from "../utils/types.js";

export async function queryLogsService(
  query: Record<string, unknown>,
): Promise<QueryLogsResult> {
  const filters = parseLogQuery(query);
  const rows = await queryLogs(filters);

  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = page[page.length - 1];

  return {
    logs: page.map(toLogResponse),
    next_cursor:
      hasMore && last ? encodeCursor(toDate(last.timestamp), last.id) : null,
  };
}

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

function toLogResponse(row: {
  id: string;
  timestamp: Date | string;
  level: string;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean> | null;
}): LogResponse {
  return {
    id: row.id,
    timestamp: toDate(row.timestamp).toISOString(),
    level: row.level,
    service: row.service,
    message: row.message,
    attributes: row.attributes ?? {},
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatBucketStart(date: Date): string {
  return date.toISOString().replace(/\.000Z$/, "Z");
}
