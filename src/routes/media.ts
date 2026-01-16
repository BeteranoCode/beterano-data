import { Router } from "express";
import { MediaType } from "@prisma/client";
import { prisma } from "../db";
import { toMediaAssetDto } from "../dto";
import {
  buildNextCursor,
  parseCursor,
  parseLimit,
  safeString,
  sendError,
} from "./helpers";

export const mediaRouter = Router();

mediaRouter.get("/media/assets", async (req, res, next) => {
  try {
    const kind = safeString(req.query.kind);
    if (!kind) {
      return sendError(res, 400, "Missing required query: kind");
    }

    const typeValue = kind.toUpperCase();
    if (!Object.values(MediaType).includes(typeValue as MediaType)) {
      return sendError(res, 400, "Invalid media type");
    }

    const query = safeString(req.query.q);
    const limit = parseLimit(req);
    const cursor = parseCursor(req);
    const whereCursor =
      cursor?.createdAt && cursor.id
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                id: { lt: cursor.id },
              },
            ],
          }
        : undefined;

    const where: Record<string, any> = {
      AND: [{ type: typeValue }, whereCursor ?? {}],
    };

    if (query) {
      where.AND.push({
        OR: [
          { key: { contains: query, mode: "insensitive" } },
          { url: { contains: query, mode: "insensitive" } },
          { path: { contains: query, mode: "insensitive" } },
        ],
      });
    }

    const data = await prisma.mediaAsset.findMany({
      where,
      include: { taxonomyNode: true, vehicleModel: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map(toMediaAssetDto);
    const nextCursor =
      data.length > limit && items.length
        ? buildNextCursor({
            id: data[Math.min(limit, data.length) - 1].id,
            createdAt: data[Math.min(limit, data.length) - 1].createdAt,
          })
        : null;

    res.set("Cache-Control", "public, max-age=120");
    res.json({ items, nextCursor });
  } catch (error) {
    next(error);
  }
});
