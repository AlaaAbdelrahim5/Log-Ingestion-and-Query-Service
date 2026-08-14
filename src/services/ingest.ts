import { insertLogs } from "../db/queries/logs.js";
import { NewLog } from "../db/schema.js";
import { BadRequestError } from "../utils/errors.js";
import { IngestResult, RejectedEntry } from "../utils/types.js";
import { validateLogEntry } from "../validation/validate-log.js";

export async function ingestLogs(body: unknown): Promise<IngestResult> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("request body must be an object");
  }

  const { logs } = body as { logs?: unknown };
  if (!Array.isArray(logs)) {
    throw new BadRequestError("request body must contain a logs array");
  }

  const accepted: NewLog[] = [];
  const rejected: RejectedEntry[] = [];

  for (let index = 0; index < logs.length; index += 1) {
    const result = validateLogEntry(logs[index]);
    if (typeof result === "string") {
      rejected.push({ index, reason: result });
    } else {
      accepted.push(result);
    }
  }

  await insertLogs(accepted);

  return {
    accepted: accepted.length,
    rejected,
  };
}
