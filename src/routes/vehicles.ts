import { Router } from "express";
import { prisma } from "../db";
import { buildNextCursor, parseCursor, parseLimit, requireQuery } from "./helpers";

export const vehiclesRouter = Router();

vehiclesRouter.get("/makes", async (req, res, next) => {
  try {
    const limit = parseLimit(req);
    const cursor = parseCursor(req);
    const where =
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

    const data = await prisma.vehicleMake.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit);
    const nextCursor =
      data.length > limit && items.length
        ? buildNextCursor({
            id: items[items.length - 1].id,
            createdAt: items[items.length - 1].createdAt,
          })
        : null;

    res.set("Cache-Control", "public, max-age=60");
    res.json({ items, nextCursor });
  } catch (error) {
    next(error);
  }
});

vehiclesRouter.get("/models", async (req, res, next) => {
  try {
    const makeId = requireQuery(req, res, "makeId");
    if (!makeId) return;

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

    const data = await prisma.vehicleModel.findMany({
      where: {
        AND: [
          { make: { OR: [{ id: makeId }, { key: makeId }] } },
          whereCursor ?? {},
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit);
    const nextCursor =
      data.length > limit && items.length
        ? buildNextCursor({
            id: items[items.length - 1].id,
            createdAt: items[items.length - 1].createdAt,
          })
        : null;

    res.set("Cache-Control", "public, max-age=60");
    res.json({ items, nextCursor });
  } catch (error) {
    next(error);
  }
});

vehiclesRouter.get("/variants", async (req, res, next) => {
  try {
    const modelId = requireQuery(req, res, "modelId");
    if (!modelId) return;

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

    const data = await prisma.vehicleVariant.findMany({
      where: {
        AND: [
          { model: { OR: [{ id: modelId }, { key: modelId }] } },
          whereCursor ?? {},
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit);
    const nextCursor =
      data.length > limit && items.length
        ? buildNextCursor({
            id: items[items.length - 1].id,
            createdAt: items[items.length - 1].createdAt,
          })
        : null;

    res.set("Cache-Control", "public, max-age=60");
    res.json({ items, nextCursor });
  } catch (error) {
    next(error);
  }
});
