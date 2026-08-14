import { Request, Response } from "express";
import { queryLogsService } from "../services/query.js";

export async function handlerQueryLogs(req: Request, res: Response) {
  const result = await queryLogsService(
    req.query as Record<string, unknown>,
  );
  res.status(200).json(result);
}
