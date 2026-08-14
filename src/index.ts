import express from "express";
import "./db/index.js";
import { registerRoutes } from "./routes/index.js";
import { startRetentionWorker } from "./services/retention.js";
import {
  errorHandlerMiddleware,
  logResponsesMiddleware,
} from "./utils/middleware.js";

const app = express();
const PORT = 8080;

app.use(express.json({ limit: "10mb" }));
app.use(logResponsesMiddleware);
registerRoutes(app);
app.use(errorHandlerMiddleware);

startRetentionWorker();

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
