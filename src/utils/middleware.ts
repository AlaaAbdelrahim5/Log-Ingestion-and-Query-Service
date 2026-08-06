import { Request, Response, NextFunction } from "express";
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "./errors";

export function logResponsesMiddleware(req: Request, res: Response) {
  if (res.statusCode !== 200) {
    console.log(
      `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`,
    );
  }
}

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.log(err);

  if (err instanceof BadRequestError) {
    return res.status(400).json({
      error: err.message,
    });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(401).json({
      error: err.message,
    });
  }

  if (err instanceof ForbiddenError) {
    return res.status(403).json({
      error: err.message,
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: err.message,
    });
  }

  return res.status(500).json({
    error: "Internal server error",
  });
}
