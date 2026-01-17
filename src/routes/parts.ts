import { Router } from "express";
import { prisma } from "../db";
import {
  toPartCategoryDto,
  toPartElementDto,
  toPartGroupDto,
  toPartSystemDto,
} from "../dto";
import {
  buildNextCursor,
  parseCursor,
  parseLimit,
  parseLocale,
  safeString,
  sendError,
} from "./helpers";

export const partsRouter = Router();

partsRouter.get("/parts/systems", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

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

    if (query) {
      where.AND.push({
        OR: [
          { key: { contains: query, mode: "insensitive" } },
          {
            translations: {
              some: {
                locale,
                name: { contains: query, mode: "insensitive" },
              },
            },
          },
        ],
      });
    }

    const data = await prisma.partSystem.findMany({
      where,
      include: { translations: { where: { locale } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map((system) =>
      toPartSystemDto(system, system.translations[0]?.name)
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

partsRouter.get("/parts/groups", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const systemKey = safeString(req.query.systemKey);
    if (!systemKey) {
      return sendError(res, 400, "Missing required query: systemKey");
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
      AND: [{ system: { key: systemKey } }, whereCursor ?? {}],
    };

    if (query) {
      where.AND.push({
        OR: [
          { key: { contains: query, mode: "insensitive" } },
          {
            translations: {
              some: {
                locale,
                name: { contains: query, mode: "insensitive" },
              },
            },
          },
        ],
      });
    }

    const data = await prisma.partGroup.findMany({
      where,
      include: {
        system: true,
        translations: { where: { locale } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map((group) =>
      toPartGroupDto(group, group.translations[0]?.name)
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

partsRouter.get("/parts/categories", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const groupKey = safeString(req.query.groupKey);
    const system = safeString(req.query.system);
    if (!groupKey && !system) {
      return sendError(res, 400, "Missing required query: groupKey or system");
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
      AND: [whereCursor ?? {}],
    };

    if (groupKey) {
      where.AND.push({ group: { key: groupKey } });
    } else if (system) {
      where.AND.push({
        taxonomyNode: {
          OR: [{ key: system }, { id: system }],
        },
      });
    }

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
      include: {
        taxonomyNode: true,
        translations: { where: { locale } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map((category) =>
      toPartCategoryDto(category, category.translations[0]?.name)
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

partsRouter.get("/parts/elements", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const categoryKey = safeString(req.query.categoryKey);
    if (!categoryKey) {
      return sendError(res, 400, "Missing required query: categoryKey");
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
      AND: [{ category: { key: categoryKey } }, whereCursor ?? {}],
    };

    if (query) {
      where.AND.push({
        OR: [
          { key: { contains: query, mode: "insensitive" } },
          {
            translations: {
              some: {
                locale,
                name: { contains: query, mode: "insensitive" },
              },
            },
          },
        ],
      });
    }

    const data = await prisma.partElement.findMany({
      where,
      include: {
        category: true,
        translations: { where: { locale } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map((element) =>
      toPartElementDto(element, element.translations[0]?.name)
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
