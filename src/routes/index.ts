import { Express } from "express";
import { handlerAggregateLogs } from "./aggregate.js";
import { handlerHealth } from "./health.js";
import { handlerIngestLogs } from "./ingest.js";
import { handlerQueryLogs } from "./logs.js";

export function registerRoutes(app: Express): void {
  app.get("/health", handlerHealth);
  app.post("/logs", handlerIngestLogs);
  app.get("/logs/aggregate", handlerAggregateLogs);
  app.get("/logs", handlerQueryLogs);
}
