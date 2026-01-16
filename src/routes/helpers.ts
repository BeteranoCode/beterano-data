import type { Request, Response } from "express";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function getPagination(req: Request) {
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;

  const limitValue = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
  const offsetValue = Array.isArray(offsetRaw) ? offsetRaw[0] : offsetRaw;

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limitValue ?? DEFAULT_LIMIT))
  );
  const offset = Math.max(0, Number(offsetValue ?? 0));

  return {
    limit: Number.isNaN(limit) ? DEFAULT_LIMIT : limit,
    offset: Number.isNaN(offset) ? 0 : offset,
  };
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
