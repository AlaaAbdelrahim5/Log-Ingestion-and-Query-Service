import { Request, Response } from "express";
import { ForbiddenError } from "./errors.js";
import { config } from "../config.js";

export async function handlerReset(_req: Request, res: Response) {
  if (config.api.platform !== "dev")
    throw new ForbiddenError(
      "Forbidden. This action is only available in development environment.",
    );

  // await deleteAllUsers();

  res.status(200).send("OK");
}
