import { CatalogItemKind } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import {
  toCatalogCategoryDto,
  toCatalogItemDto,
} from "../dto";
import {
  buildNextCursor,
  parseCursor,
  parseLimit,
  parseLocale,
  safeString,
  sendError,
} from "./helpers";

const CATALOG_ROOT_KEY = "workshop_catalog";

export const catalogRouter = Router();

catalogRouter.get("/catalog/categories", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const root = await prisma.taxonomyNode.findUnique({
      where: { key: CATALOG_ROOT_KEY },
    });

    if (!root) {
      return sendError(res, 404, "Catalog root not found");
    }

    const nodes = await prisma.taxonomyNode.findMany({
      where: { parentId: root.id },
      include: {
        translations: { where: { locale } },
      },
      orderBy: { name: "asc" },
    });

    const items = nodes.map((node) =>
      toCatalogCategoryDto(node, node.translations[0]?.name)
    );

    res.set("Cache-Control", "public, max-age=60");
    res.json({ items, nextCursor: null });
  } catch (error) {
    next(error);
  }
});

catalogRouter.get("/catalog/items", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const categoryKey = safeString(req.query.categoryKey);
    if (!categoryKey) {
      return sendError(res, 400, "Missing required query: categoryKey");
    }

    const kindRaw = safeString(req.query.kind);
    if (kindRaw && !Object.values(CatalogItemKind).includes(kindRaw as CatalogItemKind)) {
      return sendError(res, 400, "Invalid kind");
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
        { category: { key: categoryKey } },
        whereCursor ?? {},
      ],
    };

    if (kindRaw) {
      where.AND.push({ kind: kindRaw as CatalogItemKind });
    }

    if (query) {
      where.AND.push({
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { key: { contains: query, mode: "insensitive" } },
        ],
      });
    }

    const data = await prisma.workCatalogItem.findMany({
      where,
      include: {
        category: true,
        translations: { where: { locale } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map((item) =>
      toCatalogItemDto(item, item.translations[0]?.name)
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

catalogRouter.get("/catalog/lookup/item", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const codeRaw = safeString(req.query.code);
    const keyRaw = safeString(req.query.key);

    if (!codeRaw && !keyRaw) {
      return sendError(res, 400, "Missing required query: code or key");
    }

    const code = codeRaw ? Number(codeRaw) : null;
    if (codeRaw && Number.isNaN(code)) {
      return sendError(res, 400, "Invalid code");
    }

    const item = await prisma.workCatalogItem.findFirst({
      where: code !== null ? { code } : { key: keyRaw ?? undefined },
      include: {
        category: true,
        translations: { where: { locale } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (!item) {
      return res.json({ valid: false, resolved: null });
    }

    return res.json({
      valid: true,
      resolved: toCatalogItemDto(item, item.translations[0]?.name),
    });
  } catch (error) {
    next(error);
  }
});
