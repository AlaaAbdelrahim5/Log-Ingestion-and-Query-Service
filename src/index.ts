import express from "express";
import "./db/client.js";
import {
  handlerAggregateLogs,
  handlerHealth,
  handlerIngestLogs,
  handlerQueryLogs,
} from "./handlers.js";
import { startRetentionWorker } from "./services/retention.js";
import { errorHandlerMiddleware } from "./middleware.js";

const app = express();
const PORT = 8080;

app.disable("x-powered-by");
app.set("etag", false);
app.use(express.json({ limit: "16mb" }));

app.get("/health", handlerHealth);
app.post("/logs", handlerIngestLogs);
app.get("/logs/aggregate", handlerAggregateLogs);
app.get("/logs", handlerQueryLogs);

app.use(errorHandlerMiddleware);

startRetentionWorker();

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
