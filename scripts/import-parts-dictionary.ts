// Reimporta el diccionario de piezas desde datasets/parts/parts-dictionary.tsv
// (generado por dict:export y rellenado a mano): actualiza keywordsJson/aliasesJson
// por nodo y locale. SEGURO: solo toca celdas NO vacías; una celda vacía deja el
// valor existente intacto (no borra). Round-trip con export-parts-dictionary.ts.
//
//   npm run dict:import
import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { Locale, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LOCALES: Locale[] = [Locale.es, Locale.de, Locale.en];
const SRC = path.join(process.cwd(), "datasets", "parts", "parts-dictionary.tsv");

const parseList = (cell: string): string[] =>
  [...new Set(String(cell || "").split("|").map((s) => s.trim()).filter(Boolean))];

async function main() {
  const raw = await fs.readFile(SRC, "utf8");
  const rows = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = rows.shift()!.split("\t");
  const col = (name: string) => header.indexOf(name);

  // Resolver key -> id por nivel.
  const [systems, groups, categories, elements] = await Promise.all([
    prisma.partSystem.findMany({ select: { id: true, key: true } }),
    prisma.partGroup.findMany({ select: { id: true, key: true } }),
    prisma.partCategory.findMany({ select: { id: true, key: true } }),
    prisma.partElement.findMany({ select: { id: true, key: true } }),
  ]);
  const idOf: Record<string, Map<string, string>> = {
    system: new Map(systems.map((n) => [n.key, n.id])),
    group: new Map(groups.map((n) => [n.key, n.id])),
    category: new Map(categories.map((n) => [n.key, n.id])),
    element: new Map(elements.map((n) => [n.key, n.id])),
  };

  const delegate: Record<string, any> = {
    system: prisma.partSystemTranslation, group: prisma.partGroupTranslation,
    category: prisma.partCategoryTranslation, element: prisma.partElementTranslation,
  };
  const fkOf: Record<string, string> = { system: "systemId", group: "groupId", category: "categoryId", element: "elementId" };
  const whereKey: Record<string, string> = {
    system: "systemId_locale", group: "groupId_locale", category: "categoryId_locale", element: "elementId_locale",
  };

  let updated = 0, created = 0, skipped = 0, missing = 0;

  for (const line of rows) {
    const c = line.split("\t");
    const tipo = c[col("tipo")];
    const key = c[col("key")];
    const id = idOf[tipo]?.get(key);
    if (!id) { missing++; continue; }

    for (const locale of LOCALES) {
      const kw = parseList(c[col(`keywords_${locale}`)] ?? "");
      const al = parseList(c[col(`aliases_${locale}`)] ?? "");
      if (!kw.length && !al.length) { continue; } // celda vacía -> no tocar

      const data: Record<string, unknown> = {};
      if (kw.length) data.keywordsJson = kw;
      if (al.length) data.aliasesJson = al;

      const name = String(c[col(`name_${locale}`)] ?? "").trim() || key;
      const existing = await delegate[tipo].findUnique({ where: { [whereKey[tipo]]: { [fkOf[tipo]]: id, locale } } });
      if (existing) {
        await delegate[tipo].update({ where: { [whereKey[tipo]]: { [fkOf[tipo]]: id, locale } }, data });
        updated++;
      } else {
        await delegate[tipo].create({ data: { [fkOf[tipo]]: id, locale, name, ...data } });
        created++;
      }
    }
  }

  console.log(`[dict:import] actualizadas=${updated} creadas=${created} nodos-sin-match=${missing}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
