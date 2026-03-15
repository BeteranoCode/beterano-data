import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import {
  toVehicleMakeDto,
  toVehicleModelDto,
  toVehicleVariantDto,
} from "../dto";
import { buildMetadata } from "../dto/metadata";
import { buildNextCursor, parseCursor, parseLimit, requireQuery } from "./helpers";

export const vehiclesRouter = Router();

type VehicleMakeCatalogEntry = {
  key?: string;
  id?: string;
  name?: string;
};

function readFallbackVehicleMakes() {
  const brandsPath = path.join(process.cwd(), "datasets", "vehicles", "brands.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(brandsPath, "utf8")) as VehicleMakeCatalogEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        key: String(entry?.key ?? entry?.id ?? "").trim(),
        name: String(entry?.name ?? "").trim(),
      }))
      .filter((entry) => entry.key && entry.name)
      .map((entry): ReturnType<typeof toVehicleMakeDto> => ({
        ...entry,
        ...buildMetadata(entry.name, entry.key),
      }));
  } catch {
    return [];
  }
}

vehiclesRouter.get("/makes", async (req, res, next) => {
  try {
    const limit = parseLimit(req);
    const data = await prisma.vehicleMake.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
    });
    const merged = new Map<string, ReturnType<typeof toVehicleMakeDto>>(
      readFallbackVehicleMakes().map((entry) => [entry.key.toLowerCase(), entry]),
    );
    for (const entry of data.map(toVehicleMakeDto)) {
      merged.set(entry.key.toLowerCase(), entry);
    }
    const items = Array.from(merged.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);

    res.set("Cache-Control", "public, max-age=60");
    res.json({ items, nextCursor: null });
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
      include: { make: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map(toVehicleModelDto);
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
      include: { model: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = data.slice(0, limit).map(toVehicleVariantDto);
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
