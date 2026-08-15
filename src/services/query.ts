import { queryLogs } from "../db/logs.js";
import { LogResponse, QueryLogsResult } from "../types.js";
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
      hasMore && last
        ? encodeCursor(toDate(last.timestamp), String(last.id))
        : null,
  };
}

function toLogResponse(row: {
  id: string | number;
  timestamp: Date | string;
  level: string;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean> | string | null;
}): LogResponse {
  return {
    id: String(row.id),
    timestamp: toDate(row.timestamp).toISOString(),
    level: row.level,
    service: row.service,
    message: row.message,
    attributes: toAttributes(row.attributes),
  };
}

function toAttributes(
  value: Record<string, string | number | boolean> | string | null | undefined,
): Record<string, string | number | boolean> {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, string | number | boolean>;
      }
    } catch {
      return {};
    }
    return {};
  }
  return value;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
