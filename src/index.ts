import express from "express";
import "./db/index.js";
import { handlerHealth } from "./routes/health.js";
import { handlerIngestLogs, handlerQueryLogs } from "./routes/logs.js";
import { handlerAggregateLogs } from "./routes/aggregate.js";
import { startRetentionWorker } from "./services/retention.service.js";
import {
  errorHandlerMiddleware,
  logResponsesMiddleware,
} from "./utils/middleware.js";

const app = express();
const PORT = 8080;

app.use(express.json({ limit: "10mb" }));
app.use(logResponsesMiddleware);

app.get("/health", handlerHealth);
app.post("/logs", handlerIngestLogs);
app.get("/logs/aggregate", handlerAggregateLogs);
app.get("/logs", handlerQueryLogs);

app.use("/app", express.static("./src/app"));

app.use(errorHandlerMiddleware);

startRetentionWorker();

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
