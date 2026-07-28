import { Router } from "express";
import { prisma } from "../db";
import {
  toPartCategoryDto,
  toPartElementDto,
  toPartGroupDto,
  toPartSystemDto,
  toServiceOperationDto,
  toTaxonomyNodeDto,
  toVehicleMakeDto,
  toVehicleModelDto,
  toVehicleVariantDto,
} from "../dto";
import { parseLocale, requireQuery, safeString, sendError } from "./helpers";

export const lookupRouter = Router();

lookupRouter.get("/lookup/vehicle", async (req, res, next) => {
  try {
    const makeKey = requireQuery(req, res, "make");
    const modelKey = requireQuery(req, res, "model");
    if (!makeKey || !modelKey) return;

    const variantKey = safeString(req.query.variant);

    const make = await prisma.vehicleMake.findUnique({
      where: { key: makeKey },
    });

    if (!make) {
      return res.json({ valid: false, resolved: null });
    }

    const model = await prisma.vehicleModel.findFirst({
      where: { key: modelKey, makeId: make.id },
      include: { make: true },
    });

    if (!model) {
      return res.json({ valid: false, resolved: null });
    }

    if (variantKey) {
      const variant = await prisma.vehicleVariant.findFirst({
        where: { key: variantKey, modelId: model.id },
        include: { model: true },
      });

      if (!variant) {
        return res.json({ valid: false, resolved: null });
      }

      return res.json({
        valid: true,
        resolved: {
          make: toVehicleMakeDto(make),
          model: toVehicleModelDto(model),
          variant: toVehicleVariantDto(variant),
        },
      });
    }

    return res.json({
      valid: true,
      resolved: {
        make: toVehicleMakeDto(make),
        model: toVehicleModelDto(model),
      },
    });
  } catch (error) {
    next(error);
  }
});

lookupRouter.get("/lookup/service", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const skill = requireQuery(req, res, "skill");
    const taxonomyKey = requireQuery(req, res, "taxonomyKey");
    const serviceKey = requireQuery(req, res, "serviceKey");
    if (!skill || !taxonomyKey || !serviceKey) return;

    const taxonomyNode = await prisma.taxonomyNode.findUnique({
      where: { key: taxonomyKey },
      include: { parent: true },
    });

    if (!taxonomyNode) {
      return res.json({ valid: false, resolved: null });
    }

    const service = await prisma.serviceOperation.findFirst({
      where: {
        key: serviceKey,
        skillKey: skill,
        taxonomyNodeId: taxonomyNode.id,
      },
      include: {
        taxonomyNode: true,
        translations: { where: { locale } },
      },
    });

    if (!service) {
      return res.json({ valid: false, resolved: null });
    }

    return res.json({
      valid: true,
      resolved: {
        service: toServiceOperationDto(
          service,
          service.translations[0]?.name
        ),
        taxonomy: toTaxonomyNodeDto(taxonomyNode),
      },
    });
  } catch (error) {
    next(error);
  }
});

lookupRouter.get("/lookup/part", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const systemKey = requireQuery(req, res, "systemKey");
    if (!systemKey) return;

    const groupKey = safeString(req.query.groupKey);
    const categoryKey = safeString(req.query.categoryKey);
    const elementKey = safeString(req.query.elementKey);

    if (categoryKey && !groupKey) {
      return sendError(res, 400, "categoryKey requires groupKey");
    }
    if (elementKey && !categoryKey) {
      return sendError(res, 400, "elementKey requires categoryKey");
    }

    const system = await prisma.partSystem.findUnique({
      where: { key: systemKey },
      include: { translations: { where: { locale } } },
    });

    if (!system) {
      return res.json({ valid: false, resolved: null });
    }

    let group = null;
    let category = null;
    let element = null;

    if (groupKey) {
      group = await prisma.partGroup.findFirst({
        where: { key: groupKey, systemId: system.id },
        include: { system: true, translations: { where: { locale } } },
      });

      if (!group) {
        return res.json({ valid: false, resolved: null });
      }
    }

    if (categoryKey && group) {
      category = await prisma.partCategory.findFirst({
        where: { key: categoryKey, groupId: group.id },
        include: { taxonomyNode: true, translations: { where: { locale } } },
      });

      if (!category) {
        return res.json({ valid: false, resolved: null });
      }
    }

    if (elementKey && category) {
      element = await prisma.partElement.findFirst({
        where: { key: elementKey, categoryId: category.id },
        include: { category: true, translations: { where: { locale } } },
      });

      if (!element) {
        return res.json({ valid: false, resolved: null });
      }
    }

    return res.json({
      valid: true,
      resolved: {
        system: toPartSystemDto(system, system.translations[0]?.name),
        group: group
          ? toPartGroupDto(group, group.translations[0]?.name)
          : null,
        category: category
          ? toPartCategoryDto(category, category.translations[0]?.name)
          : null,
        element: element
          ? toPartElementDto(element, element.translations[0]?.name)
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// --- Matcher global de texto → nodo de taxonomía de piezas -------------------
// Dado un texto libre (título de anuncio) y un locale, devuelve los nodos que
// mejor casan por keywords/aliases/name, SIN necesidad de saber el sistema. Es
// lo contrario del validador /lookup/part (que exige las keys). Alimenta la
// auto-clasificación de recambios scrapeados.
const normText = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

type PartIndexEntry = {
  level: "system" | "group" | "category" | "element";
  systemKey: string | null;
  groupKey: string | null;
  categoryKey: string | null;
  elementKey: string | null;
  label: string;
  terms: { t: string; kw: boolean }[]; // t ya normalizado
};

const partIndexCache = new Map<string, PartIndexEntry[]>();

const buildPartTextIndex = async (locale: string): Promise<PartIndexEntry[]> => {
  const cached = partIndexCache.get(locale);
  if (cached) return cached;

  const [systems, groups, categories, elements] = await Promise.all([
    prisma.partSystem.findMany({ include: { translations: { where: { locale: locale as never } } } }),
    prisma.partGroup.findMany({ include: { translations: { where: { locale: locale as never } } } }),
    prisma.partCategory.findMany({ include: { translations: { where: { locale: locale as never } } } }),
    prisma.partElement.findMany({ include: { translations: { where: { locale: locale as never } } } }),
  ]);

  const sysById = new Map(systems.map((s) => [s.id, s]));
  const grpById = new Map(groups.map((g) => [g.id, g]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const termsOf = (tr: { name?: string; keywordsJson?: unknown; aliasesJson?: unknown } | undefined) => {
    const out: { t: string; kw: boolean }[] = [];
    for (const k of asArray(tr?.keywordsJson)) { const t = normText(k); if (t.length >= 3) out.push({ t, kw: true }); }
    for (const a of asArray(tr?.aliasesJson)) { const t = normText(a); if (t.length >= 3) out.push({ t, kw: true }); }
    const n = normText(tr?.name); if (n.length >= 3) out.push({ t: n, kw: false });
    return out;
  };

  const entries: PartIndexEntry[] = [];
  for (const s of systems) {
    entries.push({ level: "system", systemKey: s.key, groupKey: null, categoryKey: null, elementKey: null,
      label: s.translations[0]?.name || s.key, terms: termsOf(s.translations[0]) });
  }
  for (const g of groups) {
    const s = sysById.get(g.systemId);
    entries.push({ level: "group", systemKey: s?.key ?? null, groupKey: g.key, categoryKey: null, elementKey: null,
      label: g.translations[0]?.name || g.key, terms: termsOf(g.translations[0]) });
  }
  for (const c of categories) {
    const g = c.groupId ? grpById.get(c.groupId) : null;
    const s = g ? sysById.get(g.systemId) : c.systemId ? sysById.get(c.systemId) : null;
    entries.push({ level: "category", systemKey: s?.key ?? null, groupKey: g?.key ?? null, categoryKey: c.key, elementKey: null,
      label: c.translations[0]?.name || c.name || c.key, terms: termsOf(c.translations[0]) });
  }
  for (const e of elements) {
    const c = catById.get(e.categoryId);
    const g = c?.groupId ? grpById.get(c.groupId) : null;
    const s = g ? sysById.get(g.systemId) : c?.systemId ? sysById.get(c.systemId) : null;
    entries.push({ level: "element", systemKey: s?.key ?? null, groupKey: g?.key ?? null, categoryKey: c?.key ?? null, elementKey: e.key,
      label: e.translations[0]?.name || e.key, terms: termsOf(e.translations[0]) });
  }

  partIndexCache.set(locale, entries);
  return entries;
};

const LEVEL_BONUS: Record<string, number> = { element: 4, category: 3, group: 2, system: 1 };

lookupRouter.get("/lookup/part-text", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;
    const q = safeString(req.query.q);
    if (!q) return sendError(res, 400, "Missing required query: q");
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);

    const qNorm = normText(q);
    const qPhrase = ` ${qNorm} `;
    const qWords = qNorm.split(" ").filter((w) => w.length >= 2);
    const index = await buildPartTextIndex(locale);

    // Un término casa si: es una palabra exacta del query; o el query lo contiene
    // como frase (multi-palabra); o (compuesto alemán) una palabra del query empieza
    // o acaba con el término (len ≥ 4, evita falsos como "lter" dentro de "alternator").
    const matchStrength = (t: string): number => {
      if (t.includes(" ")) return qPhrase.includes(` ${t} `) ? 3 : 0;
      let s = 0;
      for (const w of qWords) {
        if (w === t) return 3;
        if (t.length >= 4 && (w.endsWith(t) || w.startsWith(t))) s = Math.max(s, 2);
      }
      return s;
    };

    const scored: { entry: PartIndexEntry; score: number; matched: string }[] = [];
    for (const entry of index) {
      let best = 0;
      let bestTerm = "";
      for (const { t, kw } of entry.terms) {
        const m = matchStrength(t);
        if (!m) continue;
        const s = t.length * (kw ? 2 : 1) + m + LEVEL_BONUS[entry.level];
        if (s > best) { best = s; bestTerm = t; }
      }
      if (best > 0) scored.push({ entry, score: best, matched: bestTerm });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);
    const maxScore = top[0]?.score || 1;

    res.set("Cache-Control", "public, max-age=60");
    res.json({
      query: q,
      locale,
      items: top.map((m) => ({
        systemKey: m.entry.systemKey,
        groupKey: m.entry.groupKey,
        categoryKey: m.entry.categoryKey,
        elementKey: m.entry.elementKey,
        level: m.entry.level,
        label: m.entry.label,
        matchedTerm: m.matched,
        score: m.score,
        confidence: Math.round((m.score / maxScore) * 100) / 100,
      })),
    });
  } catch (error) {
    next(error);
  }
});
