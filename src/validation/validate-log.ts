import { NewLog } from "../types.js";

export const LOG_LEVELS: ReadonlySet<string> = new Set([
  "debug",
  "info",
  "warn",
  "error",
]);

const MAX_FUTURE_MS = 5 * 60 * 1000;
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/i;

export function parseIso8601Timestamp(value: string): Date | undefined {
  if (!ISO_8601.test(value)) {
    return undefined;
  }

  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return undefined;
  }

  return new Date(ms);
}

export function validateLogEntry(entry: unknown): NewLog | string {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return "entry must be an object";
  }

  const log = entry as Record<string, unknown>;

  if (log.timestamp === undefined) {
    return "timestamp is required";
  }
  if (typeof log.timestamp !== "string") {
    return "timestamp must be a valid ISO 8601 timestamp";
  }

  if (!ISO_8601.test(log.timestamp)) {
    return "timestamp must be a valid ISO 8601 timestamp";
  }
  const timestampMs = Date.parse(log.timestamp);
  if (Number.isNaN(timestampMs)) {
    return "timestamp must be a valid ISO 8601 timestamp";
  }
  if (timestampMs > Date.now() + MAX_FUTURE_MS) {
    return "timestamp must not be more than five minutes in the future";
  }

  if (log.level === undefined) {
    return "level is required";
  }
  if (typeof log.level !== "string" || !LOG_LEVELS.has(log.level)) {
    return `invalid level: '${String(log.level)}'`;
  }

  if (log.service === undefined) {
    return "service is required";
  }
  if (typeof log.service !== "string" || log.service.length === 0) {
    return "service must be a non-empty string";
  }

  if (log.message === undefined) {
    return "message is required";
  }
  if (typeof log.message !== "string" || log.message.length === 0) {
    return "message must be a non-empty string";
  }

  let attributesJson = "{}";
  if (log.attributes !== undefined) {
    const attrsReason = validateAttributes(log.attributes);
    if (attrsReason) {
      return attrsReason;
    }
    attributesJson = JSON.stringify(log.attributes);
  }

  return {
    timestamp: log.timestamp,
    level: log.level as NewLog["level"],
    service: log.service,
    message: log.message,
    attributesJson,
  };
}

function validateAttributes(attributes: unknown): string | undefined {
  if (
    attributes === null ||
    typeof attributes !== "object" ||
    Array.isArray(attributes)
  ) {
    return "attributes must be a flat object";
  }

  for (const value of Object.values(attributes as Record<string, unknown>)) {
    const valueType = typeof value;
    if (
      valueType !== "string" &&
      valueType !== "number" &&
      valueType !== "boolean"
    ) {
      return "attributes values must be strings, numbers, or booleans";
    }
    if (valueType === "number" && !Number.isFinite(value)) {
      return "attributes values must be strings, numbers, or booleans";
    }
  }

  return undefined;
}
