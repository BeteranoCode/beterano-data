import { Router } from "express";
import { prisma } from "../db";
import { getPagination } from "./helpers";

export const servicesRouter = Router();

servicesRouter.get("/services/operations", async (req, res, next) => {
  try {
    const skillKeyRaw = req.query.skillKey;
    const taxonomyKeyRaw = req.query.taxonomyKey;

    const skillKey = Array.isArray(skillKeyRaw) ? skillKeyRaw[0] : skillKeyRaw;
    const taxonomyKey = Array.isArray(taxonomyKeyRaw)
      ? taxonomyKeyRaw[0]
      : taxonomyKeyRaw;

    const where: Record<string, any> = {};

    if (skillKey) {
      where.skillKey = String(skillKey);
    }

    if (taxonomyKey) {
      where.taxonomyNode = { key: String(taxonomyKey) };
    }

    const { limit, offset } = getPagination(req);
    const data = await prisma.serviceOperation.findMany({
      where,
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
