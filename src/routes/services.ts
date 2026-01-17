import { Router } from "express";
import { prisma } from "../db";
import { toServiceOperationDto } from "../dto";
import {
  buildNextCursor,
  parseCursor,
  parseLimit,
  parseLocale,
  safeString,
} from "./helpers";

export const servicesRouter = Router();

servicesRouter.get("/services/operations", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const skill = safeString(req.query.skill);
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
      AND: [whereCursor ?? {}],
    };

    if (skill) {
      where.AND.push({ skillKey: skill });
    }

    if (query) {
      where.AND.push({
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { key: { contains: query, mode: "insensitive" } },
        ],
      });
    }

    const data = await prisma.serviceOperation.findMany({
      where,
      include: {
        taxonomyNode: true,
        translations: { where: { locale } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map((operation) =>
      toServiceOperationDto(operation, operation.translations[0]?.name)
    );
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
