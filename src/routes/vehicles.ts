import { Router } from "express";
import { prisma } from "../db";
import { getPagination, requireQuery } from "./helpers";

export const vehiclesRouter = Router();

vehiclesRouter.get("/makes", async (req, res, next) => {
  try {
    const { limit, offset } = getPagination(req);
    const data = await prisma.vehicleMake.findMany({
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    });
    res.set("Cache-Control", "public, max-age=60");
    res.json({ data, pagination: { limit, offset } });
  } catch (error) {
    next(error);
  }
});

vehiclesRouter.get("/models", async (req, res, next) => {
  try {
    const makeKey = requireQuery(req, res, "makeKey");
    if (!makeKey) return;

    const { limit, offset } = getPagination(req);
    const data = await prisma.vehicleModel.findMany({
      where: { make: { key: makeKey } },
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    });
    res.set("Cache-Control", "public, max-age=60");
    res.json({ data, pagination: { limit, offset } });
  } catch (error) {
    next(error);
  }
});

vehiclesRouter.get("/variants", async (req, res, next) => {
  try {
    const modelKey = requireQuery(req, res, "modelKey");
    if (!modelKey) return;

    const { limit, offset } = getPagination(req);
    const data = await prisma.vehicleVariant.findMany({
      where: { model: { key: modelKey } },
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    });
    res.set("Cache-Control", "public, max-age=60");
    res.json({ data, pagination: { limit, offset } });
  } catch (error) {
    next(error);
  }
});
