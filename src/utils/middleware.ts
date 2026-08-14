import { Request, Response, NextFunction } from "express";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "./errors.js";

export function logResponsesMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.on("finish", () => {
    if (res.statusCode !== 200) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`,
      );
    }
  });
  next();
}

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof SyntaxError || isJsonParseError(err)) {
    return res.status(400).json({
      error: "malformed JSON",
    });
  }

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

  console.error(err);
  return res.status(500).json({
    error: "Internal server error",
  });
}

function isJsonParseError(err: Error): boolean {
  return (
    "type" in err &&
    (err as Error & { type?: string }).type === "entity.parse.failed"
  );
}
