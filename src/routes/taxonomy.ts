import { Router } from "express";
import { TaxonomyKind } from "@prisma/client";
import { prisma } from "../db";
import { buildNextCursor, parseCursor, parseLimit, safeString, sendError } from "./helpers";

export const taxonomyRouter = Router();

taxonomyRouter.get("/taxonomy/nodes", async (req, res, next) => {
  try {
    const typeRaw = safeString(req.query.type);
    const parentIdRaw = safeString(req.query.parentId);

    if (typeRaw && !Object.values(TaxonomyKind).includes(typeRaw as TaxonomyKind)) {
      return sendError(res, 400, "Invalid taxonomy type");
    }

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

    const where = {
      AND: [
        whereCursor ?? {},
        typeRaw ? { kind: typeRaw as TaxonomyKind } : {},
        parentIdRaw ? { parentId: parentIdRaw } : { parentId: null },
      ],
    };

    const data = await prisma.taxonomyNode.findMany({
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
