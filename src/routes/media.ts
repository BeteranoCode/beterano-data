import { Router } from "express";
import { MediaType } from "@prisma/client";
import { prisma } from "../db";
import { getPagination, requireQuery, sendError } from "./helpers";

export const mediaRouter = Router();

mediaRouter.get("/media", async (req, res, next) => {
  try {
    const typeRaw = requireQuery(req, res, "type");
    if (!typeRaw) return;

    const typeValue = typeRaw.toUpperCase();
    if (!Object.values(MediaType).includes(typeValue as MediaType)) {
      return sendError(res, 400, "Invalid media type");
    }

    const taxonomyKeyRaw = req.query.taxonomyKey;
    const vehicleModelKeyRaw = req.query.vehicleModelKey;

    const taxonomyKey = Array.isArray(taxonomyKeyRaw)
      ? taxonomyKeyRaw[0]
      : taxonomyKeyRaw;
    const vehicleModelKey = Array.isArray(vehicleModelKeyRaw)
      ? vehicleModelKeyRaw[0]
      : vehicleModelKeyRaw;

    const where: Record<string, any> = {
      type: typeValue,
    };

    if (taxonomyKey) {
      where.taxonomyNode = { key: String(taxonomyKey) };
    }

    if (vehicleModelKey) {
      where.vehicleModel = { key: String(vehicleModelKey) };
    }

    const { limit, offset } = getPagination(req);
    const data = await prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    res.set("Cache-Control", "public, max-age=120");
    res.json({ data, pagination: { limit, offset } });
  } catch (error) {
    next(error);
  }
});
