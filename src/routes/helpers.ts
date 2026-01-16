import { Locale } from "@prisma/client";
import type { Request, Response } from "express";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type CursorPayload = {
  id: string;
  createdAt?: Date;
};

export function parseLimit(req: Request) {
  const limitRaw = req.query.limit;
  const limitValue = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limitValue ?? DEFAULT_LIMIT))
  );

  return Number.isNaN(limit) ? DEFAULT_LIMIT : limit;
}

export function parseCursor(req: Request) {
  const cursorRaw = req.query.cursor;
  const cursorValue = Array.isArray(cursorRaw) ? cursorRaw[0] : cursorRaw;
  if (!cursorValue) return null;

  const decoded = Buffer.from(String(cursorValue), "base64").toString("utf8");
  const [createdAt, id] = decoded.split("|");

  if (!id) {
    return { id: decoded } as CursorPayload;
  }

  const parsedDate = createdAt ? new Date(createdAt) : undefined;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  return { id, createdAt: parsedDate };
}

export function buildNextCursor(payload: CursorPayload | null) {
  if (!payload) return null;
  const createdAt = payload.createdAt?.toISOString() ?? "";
  return Buffer.from(`${createdAt}|${payload.id}`).toString("base64");
}

export function safeString(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = Array.isArray(value) ? value[0] : value;
  const text = String(normalized).trim();
  return text.length ? text : null;
}

export function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: { message, status } });
}

export function requireQuery(
  req: Request,
  res: Response,
  key: string,
  message?: string
) {
  const value = req.query[key];
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized || !String(normalized).trim()) {
    sendError(res, 400, message ?? `Missing required query: ${key}`);
    return null;
  }
  return String(normalized);
}

export function parseLocale(
  req: Request,
  res: Response,
  defaultLocale: Locale = Locale.es
) {
  const rawLocale = safeString(req.query.locale);
  if (!rawLocale) return defaultLocale;
  if (Object.values(Locale).includes(rawLocale as Locale)) {
    return rawLocale as Locale;
  }
  sendError(res, 400, "Invalid locale");
  return null;
}
