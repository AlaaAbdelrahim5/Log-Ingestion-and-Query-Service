import express from "express";
import { handlerHealth } from "./routes/health.js";
import {
  errorHandlerMiddleware,
  logResponsesMiddleware,
} from "./utils/middleware.js";

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(logResponsesMiddleware);

app.get("/health", handlerHealth);

app.use("/app", express.static("./src/app"));

app.use(errorHandlerMiddleware);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
