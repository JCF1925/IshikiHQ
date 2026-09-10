import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/_workspace-api/api", router);

const structuredErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const isJsonSyntaxError = error instanceof SyntaxError && "body" in error;
  // Deliberately omit `error`: JSON parse errors can retain the raw request
  // body, which may contain credentials or health data.
  req.log.error({ code: isJsonSyntaxError ? "invalid_json" : "internal_error" }, "API request failed");
  res.status(isJsonSyntaxError ? 400 : 500).json({
    error: {
      code: isJsonSyntaxError ? "invalid_json" : "internal_error",
      message: isJsonSyntaxError ? "Request body is not valid JSON" : "An unexpected error occurred",
      requestId: String(req.id ?? "unknown"),
    },
  });
};

app.use(structuredErrorHandler);

export default app;
