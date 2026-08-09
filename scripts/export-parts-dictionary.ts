// Exporta la taxonomía de piezas + sus traducciones a un TSV editable, para
// enriquecer el "diccionario" (keywords/aliases por nodo y locale) con los términos
// que usan los vendedores en los portales. Round-trip con import-parts-dictionary.ts.
//
//   npm run dict:export   ->  datasets/parts/parts-dictionary.tsv
//
// Rellena las columnas keywords_es/de/en (separadas por "|") y reimporta.
// Nota: system/group/element NO tienen `name` base en el schema (solo `key`); el
// nombre legible sale de la traducción ES (fallback a key). Category sí tiene name.
import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LOCALES = ["es", "de", "en"] as const;
const OUT = path.join(process.cwd(), "datasets", "parts", "parts-dictionary.tsv");

const arr = (v: unknown): string => (Array.isArray(v) ? v.map(String) : []).join("|");
const cell = (v: unknown): string => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();

type Level = "system" | "group" | "category" | "element";

async function main() {
  const [systems, groups, categories, elements] = await Promise.all([
    prisma.partSystem.findMany({ select: { id: true, key: true } }),
    prisma.partGroup.findMany({ select: { id: true, key: true, systemId: true } }),
    prisma.partCategory.findMany({ select: { id: true, key: true, name: true, groupId: true, systemId: true } }),
    prisma.partElement.findMany({ select: { id: true, key: true, categoryId: true } }),
  ]);
  const [tSys, tGrp, tCat, tEl] = await Promise.all([
    prisma.partSystemTranslation.findMany(),
    prisma.partGroupTranslation.findMany(),
    prisma.partCategoryTranslation.findMany(),
    prisma.partElementTranslation.findMany(),
  ]);

  const sysById = new Map(systems.map((s) => [s.id, s]));
  const grpById = new Map(groups.map((g) => [g.id, g]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const idx = (rows: any[], fk: string) => {
    const m = new Map<string, any>();
    for (const r of rows) m.set(`${r[fk]}::${r.locale}`, r);
    return m;
  };
  const tr: Record<Level, Map<string, any>> = {
    system: idx(tSys, "systemId"), group: idx(tGrp, "groupId"),
    category: idx(tCat, "categoryId"), element: idx(tEl, "elementId"),
  };

  // Nombre legible: traducción ES → (name base de category) → key.
  const nameOf = (level: Level, id: string, baseName: string | null, key: string): string =>
    tr[level].get(`${id}::es`)?.name || baseName || key;

  const header = ["ruta", "tipo", "key", ...LOCALES.flatMap((l) => [`name_${l}`, `keywords_${l}`, `aliases_${l}`])];
  const lines: string[] = [header.join("\t")];

  const emit = (pathStr: string, tipo: Level, key: string, id: string) => {
    const cols = [cell(pathStr), tipo, key];
    for (const l of LOCALES) {
      const t = tr[tipo].get(`${id}::${l}`);
      cols.push(cell(t?.name ?? ""), t ? arr(t.keywordsJson) : "", t ? arr(t.aliasesJson) : "");
    }
    lines.push(cols.join("\t"));
  };

  for (const s of systems) emit(nameOf("system", s.id, null, s.key), "system", s.key, s.id);
  for (const g of groups) {
    const s = sysById.get(g.systemId);
    const sName = s ? nameOf("system", s.id, null, s.key) : "?";
    emit(`${sName} > ${nameOf("group", g.id, null, g.key)}`, "group", g.key, g.id);
  }
  for (const c of categories) {
    const g = c.groupId ? grpById.get(c.groupId) : null;
    const s = g ? sysById.get(g.systemId) : c.systemId ? sysById.get(c.systemId) : null;
    const parts = [
      s ? nameOf("system", s.id, null, s.key) : null,
      g ? nameOf("group", g.id, null, g.key) : null,
      nameOf("category", c.id, c.name, c.key),
    ].filter(Boolean);
    emit(parts.join(" > "), "category", c.key, c.id);
  }
  for (const e of elements) {
    const c = catById.get(e.categoryId);
    const g = c?.groupId ? grpById.get(c.groupId) : null;
    const s = g ? sysById.get(g.systemId) : c?.systemId ? sysById.get(c.systemId) : null;
    const parts = [
      s ? nameOf("system", s.id, null, s.key) : null,
      g ? nameOf("group", g.id, null, g.key) : null,
      c ? nameOf("category", c.id, c.name, c.key) : null,
      nameOf("element", e.id, null, e.key),
    ].filter(Boolean);
    emit(parts.join(" > "), "element", e.key, e.id);
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, lines.join("\n") + "\n", "utf8");
  console.log(`[dict:export] ${lines.length - 1} nodos -> ${OUT}`);
  console.log(`  systems=${systems.length} groups=${groups.length} categories=${categories.length} elements=${elements.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
