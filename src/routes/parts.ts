import { Router } from "express";
import { prisma } from "../db";
import { getPagination, requireQuery } from "./helpers";

export const partsRouter = Router();

partsRouter.get("/parts/categories", async (req, res, next) => {
  try {
    const taxonomyKey = requireQuery(req, res, "taxonomyKey");
    if (!taxonomyKey) return;

    const { limit, offset } = getPagination(req);
    const data = await prisma.partCategory.findMany({
      where: { taxonomyNode: { key: taxonomyKey } },
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
