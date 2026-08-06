import express from "express";
import {
  errorHandlerMiddleware,
  logResponsesMiddleware,
} from "./utils/middleware";

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(logResponsesMiddleware);

// Routes

app.use("/api/v1/auth");

app.use(errorHandlerMiddleware);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
