import { Request, Response } from "express";
import { pingDb } from "./db/client.js";
import { aggregateLogsService } from "./services/aggregate.js";
import { ingestLogs } from "./services/ingest.js";
import { queryLogsService } from "./services/query.js";

export async function handlerHealth(_req: Request, res: Response) {
  try {
    await pingDb();
    res.status(200).send("ok");
  } catch {
    res.status(503).send("not ready");
  }
}

export async function handlerIngestLogs(req: Request, res: Response) {
  const result = await ingestLogs(req.body);
  const status = result.accepted > 0 ? 200 : 400;
  res.status(status).json(result);
}

export async function handlerQueryLogs(req: Request, res: Response) {
  const result = await queryLogsService(
    req.query as Record<string, unknown>,
  );
  res.status(200).json(result);
}

export async function handlerAggregateLogs(req: Request, res: Response) {
  const result = await aggregateLogsService(
    req.query as Record<string, unknown>,
  );
  res.status(200).json(result);
}
