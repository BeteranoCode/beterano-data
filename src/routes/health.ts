import { Router } from "express";
import pkg from "../../package.json";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    item: {
      status: "ok",
      version: pkg.version,
      build: {
        sha: process.env.BUILD_SHA ?? null,
        time: process.env.BUILD_TIME ?? null,
      },
    },
  });
});
