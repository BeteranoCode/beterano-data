import { Router } from "express";
import { prisma } from "../db";
import { toPartCategoryDto } from "../dto";
import {
  buildNextCursor,
  parseCursor,
  parseLimit,
  safeString,
  sendError,
} from "./helpers";

export const partsRouter = Router();

partsRouter.get("/parts/categories", async (req, res, next) => {
  try {
    const system = safeString(req.query.system);
    if (!system) {
      return sendError(res, 400, "Missing required query: system");
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
      AND: [
        {
          taxonomyNode: {
            OR: [{ key: system }, { id: system }],
          },
        },
        whereCursor ?? {},
      ],
    };

    if (query) {
      where.AND.push({
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { key: { contains: query, mode: "insensitive" } },
        ],
      });
    }

    const data = await prisma.partCategory.findMany({
      where,
      include: { taxonomyNode: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map(toPartCategoryDto);
    const nextCursor =
      data.length > limit && items.length
        ? buildNextCursor({
            id: data[Math.min(limit, data.length) - 1].id,
            createdAt: data[Math.min(limit, data.length) - 1].createdAt,
          })
        : null;

    res.set("Cache-Control", "public, max-age=60");
    res.json({ items, nextCursor });
  } catch (error) {
    next(error);
  }
});
