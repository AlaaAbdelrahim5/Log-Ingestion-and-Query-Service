import { Request, Response } from "express";
import { aggregateLogsService } from "../services/query.service.js";

export async function handlerAggregateLogs(req: Request, res: Response) {
  const result = await aggregateLogsService(
    req.query as Record<string, unknown>,
  );
  res.status(200).json(result);
}
