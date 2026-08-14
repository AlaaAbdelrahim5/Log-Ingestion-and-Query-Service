import { Request, Response } from "express";
import { ingestLogs } from "../services/ingest.js";

export async function handlerIngestLogs(req: Request, res: Response) {
  const result = await ingestLogs(req.body);
  const status = result.accepted > 0 ? 200 : 400;
  res.status(status).json(result);
}
