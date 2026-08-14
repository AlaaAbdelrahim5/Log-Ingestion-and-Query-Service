import { queryLogs } from "../db/queries/logs.js";
import { LogResponse, QueryLogsResult } from "../utils/types.js";
import { encodeCursor, parseLogQuery } from "../validation/parse-query.js";

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
