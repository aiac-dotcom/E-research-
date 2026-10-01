import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { AUTH_MODE } from "./lib/auth";
import { HttpError } from "./lib/util";
import { startHarvestScheduler } from "./lib/harvest";

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

app.set("trust proxy", 1);

if (AUTH_MODE === "clerk") app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const allowedOrigins = (process.env["CORS_ORIGINS"] ?? "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ credentials: true, origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

if (AUTH_MODE === "clerk") app.use(clerkMiddleware());
else logger.warn("AUTH_MODE=dev: requests are authenticated by the x-dev-user header. Never use this in production.");

app.use("/api", router);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error({ err }, "Unhandled error");
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

startHarvestScheduler();

export default app;
