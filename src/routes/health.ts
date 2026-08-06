import { Request, Response } from "express";
import { pingDb } from "../db/index.js";

export async function handlerHealth(_req: Request, res: Response) {
  try {
    await pingDb();
    res.status(200).send("ok");
  } catch {
    res.status(503).send("not ready");
  }
}
