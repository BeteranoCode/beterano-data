import "dotenv/config";
import express from "express";
import path from "path";
import { vehiclesRouter } from "./routes/vehicles";
import { taxonomyRouter } from "./routes/taxonomy";
import { servicesRouter } from "./routes/services";
import { partsRouter } from "./routes/parts";
import { mediaRouter } from "./routes/media";
import { healthRouter } from "./routes/health";
import { sendError } from "./routes/helpers";

const app = express();
const port = Number(process.env.PORT ?? 4010);
const assetsPath = path.join(process.cwd(), "assets");
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
]);

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

const apiKeyGuard: express.RequestHandler = (req, res, next) => {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    return next();
  }

  const providedKey = req.headers["x-api-key"];
  if (typeof providedKey !== "string" || providedKey !== expectedKey) {
    return sendError(res, 401, "Unauthorized");
  }

  return next();
};

app.use(apiKeyGuard);
app.use("/assets", express.static(assetsPath));

app.use("/v1/vehicles", vehiclesRouter);
app.use("/v1", healthRouter);
app.use("/v1", taxonomyRouter);
app.use("/v1", servicesRouter);
app.use("/v1", partsRouter);
app.use("/v1", mediaRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { message: "Internal server error", status: 500 } });
});

app.listen(port, () => {
  const dbUrl = process.env.DATABASE_URL;
  let dbHost = "unknown";
  let dbPort = "unknown";
  let dbName = "unknown";

  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      dbHost = parsed.hostname || dbHost;
      dbPort = parsed.port || dbPort;
      dbName = parsed.pathname.replace("/", "") || dbName;
    } catch {
      // Ignore invalid URL formatting.
    }
  }

  console.log(`beterano-data API listening on ${port}`);
  console.log(`assets path: ${assetsPath}`);
  console.log(`database: ${dbHost}:${dbPort}/${dbName}`);
});
