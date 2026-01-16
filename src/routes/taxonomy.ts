import { Router } from "express";
import { prisma } from "../db";
import { requireQuery, sendError } from "./helpers";

export const taxonomyRouter = Router();

taxonomyRouter.get("/taxonomy", async (req, res, next) => {
  try {
    const rootKey = requireQuery(req, res, "rootKey");
    if (!rootKey) return;

    const nodes = await prisma.taxonomyNode.findMany({
      orderBy: { name: "asc" },
    });

    const nodeMap = new Map(
      nodes.map((node) => [node.id, { ...node, children: [] as any[] }])
    );

    for (const node of nodes) {
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        const child = nodeMap.get(node.id);
        if (parent && child) {
          parent.children.push(child);
        }
      }
    }

    const root = nodes.find((node) => node.key === rootKey);
    if (!root) {
      return sendError(res, 404, "Taxonomy root not found");
    }

    const tree = nodeMap.get(root.id);

    res.set("Cache-Control", "public, max-age=60");
    res.json({ data: tree });
  } catch (error) {
    next(error);
  }
});
