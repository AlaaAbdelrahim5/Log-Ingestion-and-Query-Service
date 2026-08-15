import { Request, Response, NextFunction } from "express";
import { BadRequestError } from "./utils/errors.js";

export function errorHandlerMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
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
