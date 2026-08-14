import { Request, Response } from "express";
import { ingestLogs } from "../services/ingestion.service.js";
import { queryLogsService } from "../services/query.service.js";

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
