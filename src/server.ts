import "dotenv/config";
import express from "express";
import path from "path";
import { vehiclesRouter } from "./routes/vehicles";
import { taxonomyRouter } from "./routes/taxonomy";
import { servicesRouter } from "./routes/services";
import { partsRouter } from "./routes/parts";
import { mediaRouter } from "./routes/media";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use("/assets", express.static(path.join(process.cwd(), "assets")));

app.get("/v1/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/v1/vehicles", vehiclesRouter);
app.use("/v1", taxonomyRouter);
app.use("/v1", servicesRouter);
app.use("/v1", partsRouter);
app.use("/v1", mediaRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { message: "Internal server error", status: 500 } });
});

app.listen(port, () => {
  console.log(`beterano-data API listening on ${port}`);
});
