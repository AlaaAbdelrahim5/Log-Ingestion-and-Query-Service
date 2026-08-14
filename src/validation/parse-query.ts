import { BadRequestError } from "../utils/errors.js";
import {
  AggregateQueryFilters,
  BucketSize,
  GroupBy,
  LogQueryFilters,
} from "../utils/types.js";
import { LOG_LEVELS, parseIso8601Timestamp } from "./validate-log.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET_SIZES = new Set<BucketSize>(["1m", "5m", "1h", "1d"]);
const GROUP_BY_VALUES = new Set<GroupBy>(["service", "level"]);

export function encodeCursor(timestamp: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ id, timestamp: timestamp.toISOString() }),
    "utf8",
  ).toString("base64url");
}

export function parseAggregateQuery(
  query: Record<string, unknown>,
): AggregateQueryFilters {
  const service = optionalString(query.service, "service");
  const level = optionalString(query.level, "level");
  if (level !== undefined && !LOG_LEVELS.has(level)) {
    throw new BadRequestError(`unsupported log level: '${level}'`);
  }

  const sinceValue = optionalString(query.since, "since");
  const untilValue = optionalString(query.until, "until");
  if (!sinceValue) {
    throw new BadRequestError("since is required");
  }
  if (!untilValue) {
    throw new BadRequestError("until is required");
  }

  const since = parseQueryTimestamp(sinceValue, "since");
  const until = parseQueryTimestamp(untilValue, "until");
  if (until.getTime() < since.getTime()) {
    throw new BadRequestError("until must not be earlier than since");
  }

  return {
    service,
    level,
    since,
    until,
    attributes: parseAttributeFilters(query),
    q: optionalString(query.q, "q"),
    bucket: parseBucket(query.bucket),
    groupBy: parseGroupBy(query.group_by),
  };
}

export function parseLogQuery(query: Record<string, unknown>): LogQueryFilters {
  const service = optionalString(query.service, "service");
  const level = optionalString(query.level, "level");
  if (level !== undefined && !LOG_LEVELS.has(level)) {
    throw new BadRequestError(`unsupported log level: '${level}'`);
  }

  const sinceValue = optionalString(query.since, "since");
  const untilValue = optionalString(query.until, "until");
  const since = sinceValue ? parseQueryTimestamp(sinceValue, "since") : undefined;
  const until = untilValue ? parseQueryTimestamp(untilValue, "until") : undefined;

  if (since && until && until.getTime() < since.getTime()) {
    throw new BadRequestError("until must not be earlier than since");
  }

  const q = optionalString(query.q, "q");
  const limit = parseLimit(query.limit);
  const cursorValue = optionalString(query.cursor, "cursor");
  const cursor = cursorValue ? decodeCursor(cursorValue) : undefined;

  return {
    service,
    level,
    since,
    until,
    attributes: parseAttributeFilters(query),
    q,
    limit,
    cursor,
  };
}

function decodeCursor(cursor: string): { timestamp: Date; id: string } {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { id?: unknown; timestamp?: unknown };

    if (typeof parsed.id !== "string" || !UUID_RE.test(parsed.id)) {
      throw new Error("invalid id");
    }
    if (typeof parsed.timestamp !== "string") {
      throw new Error("invalid timestamp");
    }

    const timestamp = parseIso8601Timestamp(parsed.timestamp);
    if (!timestamp) {
      throw new Error("invalid timestamp");
    }

    return { timestamp, id: parsed.id };
  } catch {
    throw new BadRequestError("invalid or malformed cursor");
  }
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, name);
}

function parseAttributeFilters(
  query: Record<string, unknown>,
): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(query)) {
    if (!rawKey.startsWith("attr.")) {
      continue;
    }

    const key = rawKey.slice("attr.".length);
    if (key.length === 0) {
      throw new BadRequestError("invalid attribute filter");
    }

    attributes[key] = requiredString(rawValue, rawKey);
  }

  return attributes;
}

function parseBucket(value: unknown): BucketSize {
  if (value === undefined) {
    throw new BadRequestError("bucket is required");
  }
  const bucket = requiredString(value, "bucket");
  if (!BUCKET_SIZES.has(bucket as BucketSize)) {
    throw new BadRequestError("bucket must be one of: 1m, 5m, 1h, 1d");
  }
  return bucket as BucketSize;
}

function parseGroupBy(value: unknown): GroupBy | undefined {
  const groupBy = optionalString(value, "group_by");
  if (groupBy === undefined) {
    return undefined;
  }
  if (!GROUP_BY_VALUES.has(groupBy as GroupBy)) {
    throw new BadRequestError("group_by must be one of: service, level");
  }
  return groupBy as GroupBy;
}

function parseLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  const raw = requiredString(value, "limit");
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestError("limit must be a number");
  }

  const limit = Number(raw);
  if (limit < 1 || limit > MAX_LIMIT) {
    throw new BadRequestError(`limit must be between 1 and ${MAX_LIMIT}`);
  }

  return limit;
}

function parseQueryTimestamp(value: string, name: string): Date {
  const date = parseIso8601Timestamp(value);
  if (!date) {
    throw new BadRequestError(`invalid ${name} timestamp`);
  }
  return date;
}

function requiredString(value: unknown, name: string): string {
  if (Array.isArray(value)) {
    throw new BadRequestError(`invalid ${name}: multiple values`);
  }
  if (typeof value !== "string") {
    throw new BadRequestError(`invalid ${name}`);
  }
  return value;
}
